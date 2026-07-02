import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Income } from '../entities/income.entity';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { HarmonyScore } from '../entities/harmony-score.entity';
import { Streak } from '../entities/streak.entity';
import { Category } from '../entities/category.entity';
import { generateId, toNum, calcMonthlyIncome } from '../common/db.helpers';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
    @InjectRepository(HarmonyScore)
    private readonly harmonyScores: Repository<HarmonyScore>,
    @InjectRepository(Streak)
    private readonly streaks: Repository<Streak>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async getSummary(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      txThisMonth,
      txLastMonth,
      incomeRows,
      debtRows,
      goalRows,
      harmonyScore,
      streakRows,
      recentTx,
    ] = await Promise.all([
      this.transactions.find({
        where: { userId, date: MoreThanOrEqual(startOfMonth) },
        relations: ['category'],
        select: ['amount', 'date', 'description', 'categoryId'],
      }),
      this.transactions.find({
        where: { userId, date: Between(startOfLastMonth, endOfLastMonth) },
        select: ['amount'],
      }),
      this.incomes.find({
        where: { userId, isActive: true },
        select: ['amount', 'frequency', 'source'],
      }),
      this.debts.find({
        where: { userId, isPaidOff: false },
        select: ['id', 'name', 'balance', 'apr', 'minimumPayment', 'dueDate', 'type'],
        order: { balance: 'DESC' },
        take: 5,
      }),
      this.goals.find({
        where: { userId, isCompleted: false },
        select: ['id', 'name', 'targetAmount', 'currentAmount', 'targetDate', 'type'],
        order: { createdAt: 'DESC' },
        take: 3,
      }),
      this.harmonyScores.findOne({
        where: { userId },
        order: { date: 'DESC' },
        select: ['score', 'debtRatioScore', 'savingsScore', 'paymentScore', 'budgetScore', 'emergencyScore', 'date'],
      }),
      this.streaks.find({
        where: { userId },
        select: ['type', 'currentStreak', 'longestStreak'],
      }),
      this.transactions.find({
        where: { userId },
        relations: ['category'],
        order: { date: 'DESC' },
        take: 5,
        select: ['id', 'amount', 'description', 'date', 'paymentMethod'],
      }),
    ]);

    const monthlyIncome = calcMonthlyIncome(incomeRows);
    const thisMonthSpend = txThisMonth.reduce((s, t) => s + toNum(t.amount), 0);
    const lastMonthSpend = txLastMonth.reduce((s, t) => s + toNum(t.amount), 0);
    const totalDebt = debtRows.reduce((s, d) => s + toNum(d.balance), 0);

    return {
      thisMonth: {
        spend: thisMonthSpend,
        income: monthlyIncome,
        savings: monthlyIncome - thisMonthSpend,
        savingsRate: monthlyIncome > 0 ? ((monthlyIncome - thisMonthSpend) / monthlyIncome) * 100 : 0,
        transactionCount: txThisMonth.length,
        vsLastMonth: lastMonthSpend > 0 ? ((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100 : 0,
      },
      totalDebt,
      debts: debtRows.map((d) => ({ ...d, balance: toNum(d.balance), apr: toNum(d.apr), minimumPayment: toNum(d.minimumPayment) })),
      goals: goalRows.map((g) => ({
        ...g,
        targetAmount: toNum(g.targetAmount),
        currentAmount: toNum(g.currentAmount),
        progress: toNum(g.targetAmount) > 0 ? (toNum(g.currentAmount) / toNum(g.targetAmount)) * 100 : 0,
      })),
      harmonyScore: harmonyScore ?? null,
      streaks: streakRows,
      recentTransactions: recentTx.map((t) => ({
        ...t,
        amount: toNum(t.amount),
        date: t.date.toISOString(),
      })),
    };
  }

  async quickAddTransaction(
    userId: string,
    data: { amount: number; description: string; categoryId?: string; paymentMethod?: string; date?: string },
  ) {
    const t = this.transactions.create({
      id: generateId(),
      userId,
      amount: String(data.amount),
      description: data.description,
      categoryId: data.categoryId ?? null,
      paymentMethod: data.paymentMethod ?? null,
      date: data.date ? new Date(data.date) : new Date(),
    });
    await this.transactions.save(t);
    const loaded = await this.transactions.findOne({ where: { id: t.id }, relations: ['category'] });
    return {
      ...loaded!,
      amount: toNum(loaded!.amount),
      date: loaded!.date.toISOString(),
    };
  }

  async getCategories(userId: string) {
    return this.categories.find({
      where: [{ isSystem: true }, { userId }],
      select: ['id', 'name', 'icon', 'color', 'isSystem'],
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }
}
