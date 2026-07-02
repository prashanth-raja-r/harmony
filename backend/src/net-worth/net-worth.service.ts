import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Goal } from '../entities/goal.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { toNum, calcMonthlyIncome } from '../common/db.helpers';

export interface NetWorthPoint {
  label: string; year: number; month: number;
  assets: number; liabilities: number; netWorth: number; isProjection: boolean;
}

export interface NetWorthResult {
  current: {
    assets: number; liabilities: number; netWorth: number;
    assetBreakdown: { savings: number; goals: number; other: number };
    liabilityBreakdown: { debts: number };
    changeFromLastMonth: number; changePercent: number;
  };
  history: NetWorthPoint[];
  milestones: { label: string; value: number; reached: boolean; month?: string }[];
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

@Injectable()
export class NetWorthService {
  constructor(
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  async getNetWorth(userId: string): Promise<NetWorthResult> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const [debtRows, goalRows, incomeRows, txRows] = await Promise.all([
      this.debts.find({
        where: { userId },
        relations: ['payments'],
        select: ['id', 'balance', 'apr', 'minimumPayment', 'isPaidOff'],
      }),
      this.goals.find({ where: { userId }, select: ['currentAmount'] }),
      this.incomes.find({ where: { userId, isActive: true }, select: ['amount', 'frequency'] }),
      this.transactions.find({
        where: { userId, date: MoreThanOrEqual(new Date(currentYear - 1, currentMonth - 1, 1)) },
        select: ['amount', 'date'],
        order: { date: 'ASC' },
      }),
    ]);

    const totalDebt = debtRows.filter((d) => !d.isPaidOff).reduce((s, d) => s + toNum(d.balance), 0);
    const totalGoals = goalRows.reduce((s, g) => s + toNum(g.currentAmount), 0);
    const monthlyIncome = calcMonthlyIncome(incomeRows);

    const txByMonth = new Map<string, number>();
    for (const t of txRows) {
      const key = `${t.date.getFullYear()}-${t.date.getMonth() + 1}`;
      txByMonth.set(key, (txByMonth.get(key) ?? 0) + toNum(t.amount));
    }

    const debtPaidByMonth = new Map<string, number>();
    for (const d of debtRows) {
      for (const p of (d as Debt & { payments: DebtPayment[] }).payments ?? []) {
        const key = `${p.paymentDate.getFullYear()}-${p.paymentDate.getMonth() + 1}`;
        debtPaidByMonth.set(key, (debtPaidByMonth.get(key) ?? 0) + toNum(p.amount));
      }
    }

    const history: NetWorthPoint[] = [];
    let runningSavings = 0;
    let runningDebt = totalDebt;

    const windowStart = new Date(currentYear - 1, currentMonth - 1, 1);
    for (const d of debtRows) {
      for (const p of (d as Debt & { payments: DebtPayment[] }).payments ?? []) {
        if (p.paymentDate >= windowStart) runningDebt += toNum(p.amount);
      }
    }

    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      const yr = d.getFullYear();
      const mo = d.getMonth() + 1;
      const key = `${yr}-${mo}`;
      const spent = txByMonth.get(key) ?? 0;
      runningSavings += monthlyIncome - spent;
      runningDebt -= debtPaidByMonth.get(key) ?? 0;
      const debtAtMonth = Math.max(0, runningDebt);
      const assetsAtMonth = Math.max(0, runningSavings) + totalGoals * ((12 - i) / 12);
      history.push({
        label: `${MONTH_LABELS[d.getMonth()]} ${yr !== currentYear ? yr : ''}`.trim(),
        year: yr, month: mo,
        assets: assetsAtMonth, liabilities: debtAtMonth,
        netWorth: assetsAtMonth - debtAtMonth, isProjection: false,
      });
    }

    const avgMonthlySavings = monthlyIncome > 0
      ? history.slice(-3).reduce((s, h, idx, arr) => s + (h.assets - (arr[idx - 1]?.assets ?? 0)), 0) / 3
      : 0;
    const savingsRate = Math.max(0, avgMonthlySavings);
    const totalMinPayment = debtRows.filter((d) => !d.isPaidOff).reduce((s, d) => s + toNum(d.minimumPayment), 0);

    const lastActual = history[history.length - 1]!;
    let projAssets = lastActual.assets;
    let projDebt = lastActual.liabilities;

    for (let i = 1; i <= 12; i++) {
      const d = new Date(currentYear, currentMonth - 1 + i, 1);
      projAssets += Math.max(0, savingsRate);
      projDebt = Math.max(0, projDebt - totalMinPayment);
      history.push({
        label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear() !== currentYear ? d.getFullYear() : ''}`.trim(),
        year: d.getFullYear(), month: d.getMonth() + 1,
        assets: projAssets, liabilities: projDebt,
        netWorth: projAssets - projDebt, isProjection: true,
      });
    }

    const currentPoint = history[11]!;
    const prevPoint = history[10];
    const changeFromLastMonth = prevPoint ? currentPoint.netWorth - prevPoint.netWorth : 0;
    const changePercent = prevPoint && prevPoint.netWorth !== 0
      ? (changeFromLastMonth / Math.abs(prevPoint.netWorth)) * 100 : 0;

    const currentNetWorth = currentPoint.netWorth;
    const milestones = this.buildMilestones(currentNetWorth, history);

    return {
      current: {
        assets: currentPoint.assets, liabilities: currentPoint.liabilities, netWorth: currentNetWorth,
        assetBreakdown: { savings: Math.max(0, currentPoint.assets - totalGoals), goals: totalGoals, other: 0 },
        liabilityBreakdown: { debts: totalDebt },
        changeFromLastMonth, changePercent,
      },
      history, milestones,
    };
  }

  private buildMilestones(currentNetWorth: number, history: NetWorthPoint[]) {
    const targets = [0, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
    return targets.map((target) => {
      const reached = currentNetWorth >= target;
      const crossingPoint = history.find((h) => h.netWorth >= target);
      return {
        label: target === 0 ? 'Debt-Free (Net Worth ≥ 0)' : `$${(target / 1000).toFixed(0)}k Net Worth`,
        value: target, reached,
        month: crossingPoint ? crossingPoint.label : undefined,
      };
    });
  }
}
