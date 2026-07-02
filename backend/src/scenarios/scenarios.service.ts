import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from '../entities/user.entity';
import { Income } from '../entities/income.entity';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { Transaction } from '../entities/transaction.entity';
import { toNum, calcMonthlyIncome } from '../common/db.helpers';

export type ScenarioType =
  | 'extra_debt_payment'
  | 'income_change'
  | 'job_loss'
  | 'big_purchase'
  | 'extra_savings'
  | 'expense_cut';

export interface ScenarioInput {
  type: ScenarioType;
  debtId?: string;
  extraPayment?: number;
  incomeChangePercent?: number;
  jobLossMonths?: number;
  purchaseAmount?: number;
  purchaseName?: string;
  monthlyAmount?: number;
}

export interface TimelinePoint {
  month: number;
  label: string;
  netWorth: number;
  debt: number;
  savings: number;
  cashFlow: number;
}

export interface ScenarioResult {
  type: ScenarioType;
  title: string;
  baseline: TimelinePoint[];
  scenario: TimelinePoint[];
  keyMetrics: { label: string; baseline: string; scenario: string; delta: string; positive: boolean }[];
  narrative: string;
}

const MONTHS_TO_PROJECT = 24;

@Injectable()
export class ScenariosService {
  private readonly anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  async simulate(userId: string, input: ScenarioInput): Promise<ScenarioResult> {
    const ctx = await this.loadContext(userId);
    const baseline = this.projectBaseline(ctx);
    const scenario = this.projectScenario(ctx, input);
    const keyMetrics = this.computeKeyMetrics(baseline, scenario, ctx.currency);
    const narrative = await this.generateNarrative(ctx, input, keyMetrics, ctx.currency);

    return {
      type: input.type,
      title: this.scenarioTitle(input, ctx),
      baseline, scenario, keyMetrics, narrative,
    };
  }

  private async loadContext(userId: string) {
    const [user, incomeRows, debtRows, goalRows, txRows] = await Promise.all([
      this.users.findOne({ where: { id: userId }, select: ['name', 'currency'] }),
      this.incomes.find({ where: { userId, isActive: true }, select: ['amount', 'frequency'] }),
      this.debts.find({
        where: { userId, isPaidOff: false },
        select: ['id', 'name', 'balance', 'apr', 'minimumPayment'],
        order: { balance: 'DESC' },
      }),
      this.goals.find({ where: { userId, isCompleted: false, type: 'EMERGENCY_FUND' }, select: ['currentAmount', 'targetAmount'] }),
      this.transactions.find({
        where: { userId, date: MoreThanOrEqual(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) },
        select: ['amount'],
      }),
    ]);

    const monthlyIncome = calcMonthlyIncome(incomeRows);
    const avgMonthlySpend = txRows.length > 0
      ? (txRows.reduce((s, t) => s + toNum(t.amount), 0) / 3)
      : monthlyIncome * 0.7;
    const emergencyFund = goalRows.reduce((s, g) => s + toNum(g.currentAmount), 0);
    const totalDebt = debtRows.reduce((s, d) => s + toNum(d.balance), 0);
    const totalMinPayment = debtRows.reduce((s, d) => s + toNum(d.minimumPayment), 0);

    return {
      monthlyIncome,
      avgMonthlySpend,
      emergencyFund,
      totalDebt,
      totalMinPayment,
      debts: debtRows.map((d) => ({ id: d.id, name: d.name, balance: toNum(d.balance), apr: toNum(d.apr), minimumPayment: toNum(d.minimumPayment) })),
      currency: user?.currency ?? 'INR',
      userName: user?.name ?? 'You',
    };
  }

  private projectBaseline(ctx: ReturnType<ScenariosService['loadContext']> extends Promise<infer T> ? T : never): TimelinePoint[] {
    const points: TimelinePoint[] = [];
    let debt = ctx.totalDebt;
    let savings = ctx.emergencyFund;
    const cashFlow = ctx.monthlyIncome - ctx.avgMonthlySpend;
    const now = new Date();

    for (let m = 0; m < MONTHS_TO_PROJECT; m++) {
      const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const label = date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
      const interest = debt > 0 ? (debt * (0.18 / 12)) : 0;
      const principal = Math.max(0, ctx.totalMinPayment - interest);
      debt = Math.max(0, debt - principal);
      savings += Math.max(0, cashFlow);
      points.push({ month: m, label, netWorth: savings - debt, debt, savings, cashFlow });
    }
    return points;
  }

  private projectScenario(
    ctx: ReturnType<ScenariosService['loadContext']> extends Promise<infer T> ? T : never,
    input: ScenarioInput,
  ): TimelinePoint[] {
    const points: TimelinePoint[] = [];
    let debt = ctx.totalDebt;
    let savings = ctx.emergencyFund;
    const now = new Date();

    for (let m = 0; m < MONTHS_TO_PROJECT; m++) {
      const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const label = date.toLocaleDateString('en', { month: 'short', year: '2-digit' });
      let income = ctx.monthlyIncome;
      let spend = ctx.avgMonthlySpend;
      let extraDebtPayment = 0;

      switch (input.type) {
        case 'extra_debt_payment':    extraDebtPayment = input.extraPayment ?? 0; break;
        case 'income_change':         income = ctx.monthlyIncome * (1 + (input.incomeChangePercent ?? 0) / 100); break;
        case 'job_loss': {
          if (m < (input.jobLossMonths ?? 3)) { income = 0; savings -= ctx.totalMinPayment + ctx.avgMonthlySpend * 0.6; }
          break;
        }
        case 'big_purchase':   if (m === 0) savings -= input.purchaseAmount ?? 0; break;
        case 'extra_savings':  spend = ctx.avgMonthlySpend - (input.monthlyAmount ?? 0); break;
        case 'expense_cut':    spend = ctx.avgMonthlySpend * (1 - (input.monthlyAmount ?? 0) / ctx.avgMonthlySpend); break;
      }

      const cashFlow = income - spend;
      const interest = debt > 0 ? (debt * (0.18 / 12)) : 0;
      const principal = Math.max(0, ctx.totalMinPayment + extraDebtPayment - interest);
      debt = Math.max(0, debt - principal);
      if (cashFlow > 0) savings += cashFlow;

      points.push({ month: m, label, netWorth: savings - debt, debt, savings, cashFlow });
    }
    return points;
  }

  private computeKeyMetrics(baseline: TimelinePoint[], scenario: TimelinePoint[], currency: string) {
    const fmt = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    const bLast = baseline[baseline.length - 1]!;
    const sLast = scenario[scenario.length - 1]!;
    const bDebtFreeMonth = baseline.findIndex((p) => p.debt <= 0);
    const sDebtFreeMonth = scenario.findIndex((p) => p.debt <= 0);

    const metrics = [
      { label: `Net Worth (${MONTHS_TO_PROJECT}mo)`, baseline: fmt(bLast.netWorth), scenario: fmt(sLast.netWorth), delta: fmt(sLast.netWorth - bLast.netWorth), positive: sLast.netWorth >= bLast.netWorth },
      { label: `Savings (${MONTHS_TO_PROJECT}mo)`,   baseline: fmt(bLast.savings),  scenario: fmt(sLast.savings),  delta: fmt(sLast.savings - bLast.savings),   positive: sLast.savings >= bLast.savings },
    ];

    if (bLast.debt > 0 || sLast.debt > 0) {
      metrics.push({ label: `Debt Remaining (${MONTHS_TO_PROJECT}mo)`, baseline: fmt(bLast.debt), scenario: fmt(sLast.debt), delta: fmt(sLast.debt - bLast.debt), positive: sLast.debt <= bLast.debt });
    }
    if (bDebtFreeMonth > 0 || sDebtFreeMonth > 0) {
      const diff = bDebtFreeMonth < 0 && sDebtFreeMonth < 0 ? 0 : (bDebtFreeMonth - sDebtFreeMonth);
      metrics.push({ label: 'Debt-Free Timeline', baseline: bDebtFreeMonth < 0 ? `>${MONTHS_TO_PROJECT}mo` : `${bDebtFreeMonth}mo`, scenario: sDebtFreeMonth < 0 ? `>${MONTHS_TO_PROJECT}mo` : `${sDebtFreeMonth}mo`, delta: diff > 0 ? `${diff}mo sooner` : diff < 0 ? `${Math.abs(diff)}mo later` : 'no change', positive: diff >= 0 });
    }

    return metrics;
  }

  private async generateNarrative(
    ctx: { monthlyIncome: number; totalDebt: number; currency: string; userName: string },
    input: ScenarioInput,
    metrics: ReturnType<ScenariosService['computeKeyMetrics']>,
    currency: string,
  ): Promise<string> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey || apiKey === 'your-anthropic-api-key-here') return this.fallbackNarrative(input, metrics);

    const fmt = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    const metricsText = metrics.map((m) => `• ${m.label}: ${m.baseline} → ${m.scenario} (${m.delta})`).join('\n');

    try {
      const msg = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: `You are Harmony Coach, a warm financial advisor. Write a 2-3 sentence plain-English summary of this financial scenario simulation. Be specific with numbers. Be encouraging but honest.\n\nScenario: ${this.scenarioTitle(input, ctx as never)}\nMonthly income: ${fmt(ctx.monthlyIncome)}\nCurrent debt: ${fmt(ctx.totalDebt)}\n\nImpact over 24 months:\n${metricsText}\n\nWrite only the narrative, no headers or bullet points.` }],
      });
      const block = msg.content[0];
      return block?.type === 'text' ? block.text : this.fallbackNarrative(input, metrics);
    } catch {
      return this.fallbackNarrative(input, metrics);
    }
  }

  private fallbackNarrative(input: ScenarioInput, metrics: ReturnType<ScenariosService['computeKeyMetrics']>): string {
    const nwMetric = metrics.find((m) => m.label.startsWith('Net Worth'));
    const delta = nwMetric?.delta ?? '';
    const positive = nwMetric?.positive ?? true;
    return positive
      ? `This scenario improves your net worth by ${delta} over 24 months. Small consistent changes compound significantly — this is worth acting on.`
      : `This scenario would reduce your net worth by ${delta} over 24 months. Consider how to offset this impact with savings adjustments.`;
  }

  private scenarioTitle(input: ScenarioInput, _ctx: { userName?: string }): string {
    switch (input.type) {
      case 'extra_debt_payment': return `Pay extra ${input.extraPayment?.toLocaleString()} on debt each month`;
      case 'income_change':      return (input.incomeChangePercent ?? 0) > 0 ? `${input.incomeChangePercent}% income increase` : `${Math.abs(input.incomeChangePercent!)}% income reduction`;
      case 'job_loss':           return `Job loss for ${input.jobLossMonths} months`;
      case 'big_purchase':       return `Buy ${input.purchaseName ?? 'big item'} for ${input.purchaseAmount?.toLocaleString()}`;
      case 'extra_savings':      return `Save extra ${input.monthlyAmount?.toLocaleString()} per month`;
      case 'expense_cut':        return `Cut expenses by ${input.monthlyAmount?.toLocaleString()} per month`;
      default:                   return 'What-if scenario';
    }
  }
}
