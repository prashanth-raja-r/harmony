import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { HarmonyScore } from '../entities/harmony-score.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Debt } from '../entities/debt.entity';
import { Budget } from '../entities/budget.entity';
import { Goal } from '../entities/goal.entity';
import { generateId, toNum, calcMonthlyIncome } from '../common/db.helpers';

export interface Pillar {
  score: number;
  label: string;
  reason: string;
}

export interface ScoreResult {
  score: number;
  debtRatioScore: number;
  savingsScore: number;
  paymentScore: number;
  budgetScore: number;
  emergencyScore: number;
  pillars: Pillar[];
}

@Injectable()
export class ScoreService {
  constructor(
    @InjectRepository(HarmonyScore)
    private readonly harmonyScores: Repository<HarmonyScore>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(Budget)
    private readonly budgets: Repository<Budget>,
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
  ) {}

  async calculateAndSave(userId: string): Promise<ScoreResult & { id: string; date: string }> {
    const result = await this.compute(userId);
    const saved = this.harmonyScores.create({
      id: generateId(),
      userId,
      score: Math.round(result.score),
      debtRatioScore: Math.round(result.debtRatioScore),
      savingsScore: Math.round(result.savingsScore),
      paymentScore: Math.round(result.paymentScore),
      budgetScore: Math.round(result.budgetScore),
      emergencyScore: Math.round(result.emergencyScore),
    });
    await this.harmonyScores.save(saved);
    return { ...result, id: saved.id, date: saved.date.toISOString() };
  }

  async getLatest(userId: string) {
    const stored = await this.harmonyScores.findOne({
      where: { userId },
      order: { date: 'DESC' },
    });
    const live = await this.compute(userId);
    return { live, stored: stored ? { ...stored, date: stored.date.toISOString() } : null };
  }

  async getHistory(userId: string, limit = 12) {
    const rows = await this.harmonyScores.find({
      where: { userId },
      order: { date: 'ASC' },
      take: limit,
      select: ['id', 'score', 'debtRatioScore', 'savingsScore', 'paymentScore', 'budgetScore', 'emergencyScore', 'date'],
    });
    return rows.map((r) => ({ ...r, date: r.date.toISOString() }));
  }

  private async compute(userId: string): Promise<ScoreResult> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1);

    const [incomeRows, txRows, debtRows, budgetRows, goalRows] = await Promise.all([
      this.incomes.find({ where: { userId, isActive: true }, select: ['amount', 'frequency'] }),
      this.transactions.find({ where: { userId, date: MoreThanOrEqual(startOfMonth) }, select: ['amount', 'categoryId'] }),
      this.debts.find({ where: { userId, isPaidOff: false }, select: ['balance', 'minimumPayment'] }),
      this.budgets.find({ where: { userId, month, year }, select: ['amount', 'categoryId'] }),
      this.goals.find({ where: { userId, isCompleted: false, type: 'EMERGENCY_FUND' }, select: ['currentAmount', 'targetAmount'] }),
    ]);

    const monthlyIncome = calcMonthlyIncome(incomeRows);
    const totalSpend = txRows.reduce((s, t) => s + toNum(t.amount), 0);
    const totalDebt = debtRows.reduce((s, d) => s + toNum(d.balance), 0);
    const totalMinPayment = debtRows.reduce((s, d) => s + toNum(d.minimumPayment), 0);

    const debtRatioScore = this.scoreDebtRatio(totalMinPayment, monthlyIncome);
    const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - totalSpend) / monthlyIncome) * 100 : 0;
    const savingsScore = this.scoreSavings(savingsRate);
    const paymentScore = this.scorePayments(txRows.length, monthlyIncome, totalMinPayment);
    const budgetScore = this.scoreBudgets(txRows, budgetRows);
    const emergencyScore = this.scoreEmergency(goalRows, monthlyIncome, totalDebt);

    const score =
      debtRatioScore * 0.25 +
      savingsScore * 0.25 +
      paymentScore * 0.20 +
      budgetScore * 0.15 +
      emergencyScore * 0.15;

    const pillars: Pillar[] = [
      { score: debtRatioScore, label: 'Debt Ratio',       reason: this.debtRatioReason(totalMinPayment, monthlyIncome) },
      { score: savingsScore,   label: 'Savings Rate',     reason: this.savingsReason(savingsRate) },
      { score: paymentScore,   label: 'Payment Health',   reason: this.paymentReason(txRows.length, monthlyIncome) },
      { score: budgetScore,    label: 'Budget Control',   reason: this.budgetReason(txRows, budgetRows) },
      { score: emergencyScore, label: 'Emergency Fund',   reason: this.emergencyReason(goalRows) },
    ];

    return {
      score: Math.min(Math.max(score, 0), 100),
      debtRatioScore, savingsScore, paymentScore, budgetScore, emergencyScore,
      pillars,
    };
  }

  private scoreDebtRatio(minPayment: number, income: number): number {
    if (income === 0) return minPayment === 0 ? 80 : 40;
    const ratio = minPayment / income;
    if (ratio <= 0)    return 100;
    if (ratio <= 0.10) return 95;
    if (ratio <= 0.20) return 80;
    if (ratio <= 0.30) return 65;
    if (ratio <= 0.40) return 45;
    if (ratio <= 0.50) return 25;
    return 10;
  }

  private scoreSavings(rate: number): number {
    if (rate >= 30) return 100;
    if (rate >= 20) return 85;
    if (rate >= 15) return 75;
    if (rate >= 10) return 60;
    if (rate >= 5)  return 45;
    if (rate >= 0)  return 25;
    return 0;
  }

  private scorePayments(txCount: number, income: number, minPayment: number): number {
    let s = 50;
    if (income > 0) s += 20;
    if (txCount >= 5) s += 15;
    if (txCount >= 15) s += 10;
    if (minPayment > 0 && income > 0 && minPayment <= income) s += 5;
    return Math.min(s, 100);
  }

  private scoreBudgets(
    transactions: { amount: unknown; categoryId: string | null }[],
    budgets: { amount: unknown; categoryId: string }[],
  ): number {
    if (budgets.length === 0) return 50;
    const spent: Record<string, number> = {};
    for (const t of transactions) {
      if (t.categoryId) spent[t.categoryId] = (spent[t.categoryId] ?? 0) + toNum(t.amount);
    }
    let overBudget = 0;
    for (const b of budgets) {
      if ((spent[b.categoryId] ?? 0) > toNum(b.amount)) overBudget++;
    }
    const ratio = overBudget / budgets.length;
    if (ratio === 0)    return 100;
    if (ratio <= 0.10)  return 85;
    if (ratio <= 0.25)  return 70;
    if (ratio <= 0.50)  return 50;
    if (ratio <= 0.75)  return 30;
    return 10;
  }

  private scoreEmergency(
    goals: { currentAmount: unknown; targetAmount: unknown }[],
    income: number,
    debt: number,
  ): number {
    if (goals.length > 0) {
      const best = goals.reduce((b, g) => {
        const pct = toNum(g.targetAmount) > 0 ? toNum(g.currentAmount) / toNum(g.targetAmount) : 0;
        return pct > b ? pct : b;
      }, 0);
      if (best >= 1)    return 100;
      if (best >= 0.75) return 80;
      if (best >= 0.50) return 60;
      if (best >= 0.25) return 40;
      return 20;
    }
    if (debt === 0 && income > 0) return 70;
    if (debt > 0 && income > 0 && debt < income * 3) return 50;
    return 30;
  }

  private debtRatioReason(minPayment: number, income: number): string {
    if (income === 0) return 'No income configured yet.';
    const pct = ((minPayment / income) * 100).toFixed(0);
    if (minPayment === 0) return 'No debt payments — excellent!';
    return `Debt payments are ${pct}% of monthly income.`;
  }

  private savingsReason(rate: number): string {
    if (rate >= 20) return `You're saving ${rate.toFixed(0)}% — great discipline!`;
    if (rate >= 10) return `Saving ${rate.toFixed(0)}% — aim for 20%+ to build wealth faster.`;
    if (rate >= 0)  return `Saving ${rate.toFixed(0)}% — small savings still count, keep growing.`;
    return 'Spending exceeds income this month — review your budget.';
  }

  private paymentReason(txCount: number, income: number): string {
    if (income === 0) return 'Add income sources to improve this score.';
    if (txCount < 5) return 'Track more transactions for a better picture.';
    return `${txCount} transactions tracked — good habit!`;
  }

  private budgetReason(
    transactions: { amount: unknown; categoryId: string | null }[],
    budgets: { amount: unknown; categoryId: string }[],
  ): string {
    if (budgets.length === 0) return 'Set budgets per category to unlock this score.';
    const spent: Record<string, number> = {};
    for (const t of transactions) {
      if (t.categoryId) spent[t.categoryId] = (spent[t.categoryId] ?? 0) + toNum(t.amount);
    }
    const over = budgets.filter((b) => (spent[b.categoryId] ?? 0) > toNum(b.amount)).length;
    if (over === 0) return 'All budgets on track!';
    return `${over} of ${budgets.length} budget${budgets.length > 1 ? 's' : ''} exceeded this month.`;
  }

  private emergencyReason(goals: { currentAmount: unknown; targetAmount: unknown }[]): string {
    if (goals.length === 0) return 'Create an Emergency Fund goal to track your safety net.';
    const best = goals.reduce((b, g) => {
      const pct = toNum(g.targetAmount) > 0 ? toNum(g.currentAmount) / toNum(g.targetAmount) : 0;
      return pct > b ? pct : b;
    }, 0);
    if (best >= 1) return 'Emergency fund fully funded — outstanding!';
    return `Emergency fund is ${(best * 100).toFixed(0)}% funded.`;
  }
}
