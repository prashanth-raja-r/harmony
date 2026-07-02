import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Streak } from '../entities/streak.entity';
import { toNum, calcMonthlyIncome } from '../common/db.helpers';

export interface TodayAction {
  id: string;
  type: string;
  title: string;
  description: string | null;
  priority: number;
  metadata: Record<string, unknown> | null;
  isCompleted: boolean;
}

@Injectable()
export class TodayService {
  constructor(
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly payments: Repository<DebtPayment>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Streak)
    private readonly streaks: Repository<Streak>,
  ) {}

  async getToday(userId: string) {
    const now = new Date();
    const today = now.getDate();
    const tomorrow = new Date(now);
    tomorrow.setDate(today + 1);
    const tomorrowDay = tomorrow.getDate();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay     = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth   = now.getDate();

    const [debtRows, incomeRows, todayTx, monthTx, streak] = await Promise.all([
      this.debts.find({
        where: { userId, isPaidOff: false },
        relations: ['payments'],
        order: { balance: 'DESC' },
      }),
      this.incomes.find({ where: { userId, isActive: true } }),
      this.transactions.find({ where: { userId, date: Between(startOfDay, endOfDay) }, select: ['amount'] }),
      this.transactions.find({ where: { userId, date: MoreThanOrEqual(startOfMonth) }, select: ['amount'] }),
      this.streaks.findOne({ where: { userId, type: 'expense_logging' } }),
    ]);

    // Filter each debt's payments to this month
    const debtsWithMonthPayments = debtRows.map((d) => ({
      ...d,
      paymentsThisMonth: (d.payments ?? []).filter((p) => new Date(p.paymentDate) >= startOfMonth),
    }));

    const actions: TodayAction[] = [];
    let priority = 0;

    // 1. Debts due today or tomorrow
    for (const debt of debtsWithMonthPayments) {
      if (debt.dueDate === today || debt.dueDate === tomorrowDay) {
        const paidThisMonth = debt.paymentsThisMonth.length > 0;
        if (!paidThisMonth) {
          const when = debt.dueDate === today ? 'today' : 'tomorrow';
          actions.push({
            id: `pay_${debt.id}`,
            type: 'pay_debt',
            title: `Pay ₹${toNum(debt.minimumPayment).toLocaleString('en-IN')} to ${debt.name}`,
            description: `EMI due ${when}`,
            priority: priority++,
            metadata: { debtId: debt.id, amount: toNum(debt.minimumPayment) },
            isCompleted: false,
          });
        }
      }
    }

    // 2. Unconfirmed EMIs this month
    for (const debt of debtsWithMonthPayments) {
      if (debt.dueDate <= today && debt.paymentsThisMonth.length === 0) {
        const alreadyAdded = actions.some((a) => a.type === 'pay_debt' && (a.metadata as Record<string, unknown>)?.debtId === debt.id);
        if (!alreadyAdded) {
          actions.push({
            id: `confirm_${debt.id}`,
            type: 'confirm_emi',
            title: `Confirm ${debt.name} EMI payment`,
            description: `Due date was the ${debt.dueDate}${ordinal(debt.dueDate)}`,
            priority: priority++,
            metadata: { debtId: debt.id },
            isCompleted: false,
          });
        }
      }
    }

    // 3. No expense logged today
    if (todayTx.length === 0) {
      actions.push({
        id: 'log_expense',
        type: 'log_expense',
        title: "Log today's spending",
        description: 'Track every rupee to stay in control',
        priority: priority++,
        metadata: null,
        isCompleted: false,
      });
    }

    // 4. Spending velocity warning
    const monthlyIncome = calcMonthlyIncome(incomeRows);
    const totalMinPayments = debtRows.reduce((s, d) => s + toNum(d.minimumPayment), 0);
    const monthlyBudget = Math.max(0, monthlyIncome - totalMinPayments);
    const dailyBudget = monthlyBudget / daysInMonth;
    const monthSpend = monthTx.reduce((s, t) => s + toNum(t.amount), 0);
    const proratedBudget = (monthlyBudget / daysInMonth) * dayOfMonth;

    if (monthSpend > proratedBudget && proratedBudget > 0) {
      const pct = Math.round((monthSpend / monthlyBudget) * 100);
      const daysLeft = daysInMonth - dayOfMonth;
      actions.push({
        id: 'velocity_warning',
        type: 'spending_warning',
        title: `${pct}% of budget spent with ${daysLeft} days left`,
        description: `Spent ₹${Math.round(monthSpend).toLocaleString('en-IN')} of ₹${Math.round(monthlyBudget).toLocaleString('en-IN')}`,
        priority: priority++,
        metadata: { spent: monthSpend, budget: monthlyBudget, pct },
        isCompleted: false,
      });
    }

    // 5. Streak at risk
    if (streak) {
      const lastActivity = new Date(streak.lastActivityAt);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday =
        lastActivity.getFullYear() === yesterday.getFullYear() &&
        lastActivity.getMonth() === yesterday.getMonth() &&
        lastActivity.getDate() === yesterday.getDate();

      if (isYesterday && streak.currentStreak > 0) {
        actions.push({
          id: 'streak_risk',
          type: 'streak_risk',
          title: `Keep your ${streak.currentStreak}-day streak alive`,
          description: 'Log an expense to maintain your streak',
          priority: priority++,
          metadata: { currentStreak: streak.currentStreak },
          isCompleted: false,
        });
      }
    }

    // 6. Weekly review on Sundays
    if (now.getDay() === 0) {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekTx = await this.transactions.find({ where: { userId, date: MoreThanOrEqual(weekAgo) }, select: ['amount'] });
      const weekSpend = weekTx.reduce((s, t) => s + toNum(t.amount), 0);
      actions.push({
        id: 'weekly_review',
        type: 'review_spending',
        title: `You spent ₹${Math.round(weekSpend).toLocaleString('en-IN')} this week`,
        description: 'Review your spending patterns',
        priority: priority++,
        metadata: { weekSpend },
        isCompleted: false,
      });
    }

    // 7. Celebrations — debt paid off today
    const recentPaidOff = await this.debts.find({
      where: { userId, isPaidOff: true, paidOffAt: MoreThanOrEqual(startOfDay) },
      select: ['id', 'name'],
    });
    for (const d of recentPaidOff) {
      actions.push({
        id: `celebrate_${d.id}`,
        type: 'celebrate',
        title: `You paid off ${d.name}!`,
        description: 'One less debt. Keep going.',
        priority: priority++,
        metadata: { debtId: d.id },
        isCompleted: false,
      });
    }

    // Debt-free stats
    const totalDebt = debtRows.reduce((s, d) => s + toNum(d.balance), 0);
    const totalMin = debtRows.reduce((s, d) => s + toNum(d.minimumPayment), 0);
    let monthsRemaining: number | null = null;
    let debtFreeDate: string | null = null;
    if (totalDebt > 0 && totalMin > 0) {
      monthsRemaining = Math.ceil(totalDebt / totalMin);
      const dfDate = new Date(now);
      dfDate.setMonth(dfDate.getMonth() + monthsRemaining);
      debtFreeDate = dfDate.toISOString();
    }

    const todaySpend = todayTx.reduce((s, t) => s + toNum(t.amount), 0);

    return {
      actions: actions.sort((a, b) => a.priority - b.priority),
      debtFree: { totalDebt, monthsRemaining, debtFreeDate },
      streak: streak
        ? { current: streak.currentStreak, longest: streak.longestStreak, type: streak.type }
        : null,
      todaySpend,
      dailyBudget: Math.round(dailyBudget),
    };
  }

  /** No persistent daily-action model — returns a minimal confirmation */
  async completeAction(_userId: string, actionId: string) {
    return { id: actionId, isCompleted: true, completedAt: new Date().toISOString() };
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10]! || s[v]! || s[0]!;
}
