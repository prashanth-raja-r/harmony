import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Like, Between } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Goal } from '../entities/goal.entity';
import { generateId, toNum } from '../common/db.helpers';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Budget)
    private readonly budgets: Repository<Budget>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly payments: Repository<DebtPayment>,
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
  ) {}

  async getAll(userId: string) {
    const rows = await this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }));
  }

  async getUnreadCount(userId: string) {
    const count = await this.notifications.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const n = await this.notifications.findOne({ where: { id, userId } });
    if (!n) return null;
    await this.notifications.update(id, { isRead: true });
    return { ...n, isRead: true };
  }

  async markAllRead(userId: string) {
    await this.notifications.update({ userId, isRead: false }, { isRead: true });
    return { updated: true };
  }

  async delete(userId: string, id: string) {
    await this.notifications.delete({ id, userId });
    return { deleted: true };
  }

  async clearAll(userId: string) {
    await this.notifications.delete({ userId });
    return { deleted: true };
  }

  async create(userId: string, data: { type: string; title: string; message: string; link?: string }) {
    const n = this.notifications.create({
      id: generateId(),
      userId,
      type: data.type,
      title: data.title,
      message: data.message,
      link: data.link ?? null,
    });
    return this.notifications.save(n);
  }

  async generateSmartNotifications(userId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1);

    const [txRows, budgetRows, debtRows, goalRows] = await Promise.all([
      this.transactions.find({
        where: { userId, date: MoreThanOrEqual(startOfMonth) },
        select: ['amount', 'categoryId'],
      }),
      this.budgets.find({
        where: { userId, month, year },
        relations: ['category'],
        select: ['id', 'categoryId', 'amount'],
      }),
      this.debts.find({
        where: { userId, isPaidOff: false },
        select: ['id', 'name', 'type', 'dueDate', 'minimumPayment'],
      }),
      this.goals.find({
        where: { userId, isCompleted: false },
        select: ['id', 'name', 'currentAmount', 'targetAmount'],
      }),
    ]);

    const created: string[] = [];
    const YEARLY_RENEWAL = new Set(['OVERDRAFT', 'JEWEL_LOAN']);

    // Budget overspend alerts
    const spent: Record<string, number> = {};
    for (const t of txRows) {
      if (t.categoryId) spent[t.categoryId] = (spent[t.categoryId] ?? 0) + toNum(t.amount);
    }
    for (const b of budgetRows) {
      const s = spent[b.categoryId] ?? 0;
      const budget = toNum(b.amount);
      if (s > budget) {
        const catName = (b as typeof b & { category?: { name: string } }).category?.name ?? b.categoryId;
        const exists = await this.notifications.findOne({
          where: { userId, type: 'BUDGET_OVERSPEND', message: Like(`%${catName}%`), createdAt: MoreThanOrEqual(startOfMonth) },
        });
        if (!exists) {
          await this.create(userId, {
            type: 'BUDGET_OVERSPEND',
            title: `Budget exceeded: ${catName}`,
            message: `You've spent ${((s / budget) * 100).toFixed(0)}% of your ${catName} budget this month.`,
            link: '/money',
          });
          created.push('BUDGET_OVERSPEND');
        }
      }
    }

    // Debt due soon + overdue EMI confirmation
    for (const d of debtRows) {
      if (YEARLY_RENEWAL.has(d.type)) continue;

      const dueThisMonth = new Date(year, month - 1, d.dueDate);
      const daysUntil = Math.ceil((dueThisMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= 7) {
        const exists = await this.notifications.findOne({
          where: { userId, type: 'DEBT_PAYMENT', title: Like('%due soon%'), message: Like(`%${d.name}%`), createdAt: MoreThanOrEqual(startOfMonth) },
        });
        if (!exists) {
          await this.create(userId, {
            type: 'DEBT_PAYMENT',
            title: `Payment due soon: ${d.name}`,
            message: `Your ${d.name} payment of ₹${toNum(d.minimumPayment).toLocaleString()} is due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}.`,
            link: '/debts',
          });
          created.push('DEBT_PAYMENT');
        }
      } else if (daysUntil < 0) {
        const paidThisMonth = await this.payments.findOne({
          where: { debtId: d.id, paymentDate: MoreThanOrEqual(startOfMonth) },
        });
        if (!paidThisMonth) {
          const exists = await this.notifications.findOne({
            where: { userId, type: 'DEBT_PAYMENT', title: Like('%confirm%'), message: Like(`%${d.name}%`), createdAt: MoreThanOrEqual(startOfMonth) },
          });
          if (!exists) {
            await this.create(userId, {
              type: 'DEBT_PAYMENT',
              title: `Confirm EMI: ${d.name}`,
              message: `Did you pay your ${d.name} EMI this month? Due on the ${d.dueDate}th. Tap to confirm.`,
              link: `/debts?confirm=${d.id}`,
            });
            created.push('DEBT_PAYMENT');
          }
        }
      }
    }

    // Goal milestone reached
    for (const g of goalRows) {
      const progress = toNum(g.targetAmount) > 0 ? (toNum(g.currentAmount) / toNum(g.targetAmount)) * 100 : 0;
      for (const threshold of [25, 50, 75, 90, 100]) {
        if (progress >= threshold) {
          const exists = await this.notifications.findOne({
            where: { userId, type: 'GOAL_MILESTONE', title: Like(`%${g.name}%`), message: Like(`%${threshold}%%`) },
          });
          if (!exists) {
            await this.create(userId, {
              type: 'GOAL_MILESTONE',
              title: `${threshold}% milestone: ${g.name}`,
              message: `You've reached ${threshold}% of your "${g.name}" goal. Keep going!`,
              link: '/goals',
            });
            created.push('GOAL_MILESTONE');
          }
        }
      }
    }

    // Recurring bill reminders — check previous month's recurring transactions
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStart = new Date(prevYear, prevMonth - 1, 1);
    const prevEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

    const recurringLastMonth = await this.transactions.find({
      where: { userId, isRecurring: true, date: Between(prevStart, prevEnd) },
      relations: ['category'],
    });

    for (const t of recurringLastMonth) {
      // Check if any recurring transaction exists in the same category this month
      const alreadyLogged = await this.transactions.findOne({
        where: {
          userId,
          isRecurring: true,
          ...(t.categoryId ? { categoryId: t.categoryId } : {}),
          date: MoreThanOrEqual(startOfMonth),
        },
      });
      if (alreadyLogged) continue;

      const shortDesc = t.description.slice(0, 40);
      const exists = await this.notifications.findOne({
        where: { userId, type: 'RECURRING_BILL', message: Like(`%${shortDesc}%`), createdAt: MoreThanOrEqual(startOfMonth) },
      });
      if (!exists) {
        const cat = (t as typeof t & { category?: { name: string } }).category;
        const catName = cat?.name ?? 'bill';
        await this.create(userId, {
          type: 'RECURRING_BILL',
          title: `Recurring bill pending: ${t.description}`,
          message: `Your "${shortDesc}" ${catName} recurring payment (₹${toNum(t.amount).toLocaleString('en-IN')}) hasn't been logged this month yet.`,
          link: '/money',
        });
        created.push('RECURRING_BILL');
      }
    }

    return { generated: created.length, types: created };
  }
}
