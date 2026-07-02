import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { toNum } from '../common/db.helpers';

export interface CategorySlice {
  categoryId: string; name: string; icon: string; color: string;
  total: number; pct: number; avgMonthly: number;
  trend: 'up' | 'down' | 'stable'; trendPct: number;
}

export interface SpendingTrait {
  id: string; label: string; description: string; score: number; icon: string;
}

export interface MonthlyHeatPoint {
  month: string; year: number; total: number; byCategory: Record<string, number>;
}

export interface DayOfWeekPattern {
  day: string; avg: number; count: number;
}

export interface SpendingDnaResult {
  totalAnalyzed: number; monthsAnalyzed: number; avgMonthly: number;
  categories: CategorySlice[]; traits: SpendingTrait[];
  heatmap: MonthlyHeatPoint[]; dayOfWeek: DayOfWeekPattern[];
  topMerchants: { description: string; total: number; count: number }[];
  insight: string;
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

@Injectable()
export class SpendingDnaService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  async analyze(userId: string): Promise<SpendingDnaResult> {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const txRows = await this.transactions.find({
      where: { userId, date: MoreThanOrEqual(sixMonthsAgo) },
      relations: ['category'],
      order: { date: 'ASC' },
    });

    if (txRows.length === 0) return this.emptyResult();

    const totalAnalyzed = txRows.reduce((s, t) => s + toNum(t.amount), 0);
    const monthsSet = new Set(txRows.map((t) => `${t.date.getFullYear()}-${t.date.getMonth()}`));
    const monthsAnalyzed = monthsSet.size || 1;
    const avgMonthly = totalAnalyzed / monthsAnalyzed;

    const catMap = new Map<string, { name: string; icon: string; color: string; total: number; byMonth: Record<string, number> }>();

    for (const t of txRows) {
      const key = t.categoryId ?? 'uncategorised';
      if (!catMap.has(key)) {
        catMap.set(key, {
          name: t.category?.name ?? 'Uncategorised',
          icon: t.category?.icon ?? '💸',
          color: t.category?.color ?? '#64748b',
          total: 0, byMonth: {},
        });
      }
      const entry = catMap.get(key)!;
      entry.total += toNum(t.amount);
      const mk = `${t.date.getFullYear()}-${t.date.getMonth()}`;
      entry.byMonth[mk] = (entry.byMonth[mk] ?? 0) + toNum(t.amount);
    }

    const midpoint = new Date(sixMonthsAgo.getTime() + (now.getTime() - sixMonthsAgo.getTime()) / 2);

    const categories: CategorySlice[] = Array.from(catMap.entries()).map(([categoryId, v]) => {
      const pct = totalAnalyzed > 0 ? (v.total / totalAnalyzed) * 100 : 0;
      const avgMonthlyVal = v.total / monthsAnalyzed;
      const firstHalf  = txRows.filter((t) => (t.categoryId ?? 'uncategorised') === categoryId && t.date < midpoint).reduce((s, t) => s + toNum(t.amount), 0);
      const secondHalf = txRows.filter((t) => (t.categoryId ?? 'uncategorised') === categoryId && t.date >= midpoint).reduce((s, t) => s + toNum(t.amount), 0);
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let trendPct = 0;
      if (firstHalf > 0) {
        trendPct = ((secondHalf - firstHalf) / firstHalf) * 100;
        if (trendPct > 5) trend = 'up';
        else if (trendPct < -5) trend = 'down';
      }
      return { categoryId, name: v.name, icon: v.icon, color: v.color, total: v.total, pct, avgMonthly: avgMonthlyVal, trend, trendPct };
    }).sort((a, b) => b.total - a.total);

    const heatMap = new Map<string, MonthlyHeatPoint>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      heatMap.set(`${d.getFullYear()}-${d.getMonth()}`, { month: MONTH_LABELS[d.getMonth()]!, year: d.getFullYear(), total: 0, byCategory: {} });
    }
    for (const t of txRows) {
      const hp = heatMap.get(`${t.date.getFullYear()}-${t.date.getMonth()}`);
      if (!hp) continue;
      hp.total += toNum(t.amount);
      const catName = t.category?.name ?? 'Uncategorised';
      hp.byCategory[catName] = (hp.byCategory[catName] ?? 0) + toNum(t.amount);
    }
    const heatmap = Array.from(heatMap.values());

    const dowMap: Record<number, { total: number; count: number }> = {};
    for (let d = 0; d < 7; d++) dowMap[d] = { total: 0, count: 0 };
    for (const t of txRows) {
      const dow = t.date.getDay();
      dowMap[dow]!.total += toNum(t.amount);
      dowMap[dow]!.count += 1;
    }
    const dayOfWeek: DayOfWeekPattern[] = DAY_LABELS.map((day, i) => ({
      day, avg: dowMap[i]!.count > 0 ? dowMap[i]!.total / dowMap[i]!.count : 0, count: dowMap[i]!.count,
    }));

    const merchantMap = new Map<string, { total: number; count: number }>();
    for (const t of txRows) {
      const key = t.description.trim();
      const entry = merchantMap.get(key) ?? { total: 0, count: 0 };
      entry.total += toNum(t.amount);
      entry.count += 1;
      merchantMap.set(key, entry);
    }
    const topMerchants = Array.from(merchantMap.entries())
      .map(([description, v]) => ({ description, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const traits = this.computeTraits(categories, avgMonthly, totalAnalyzed, dayOfWeek);
    const topCat = categories[0];
    const impulseDays = dayOfWeek.filter((d) => ['Fri', 'Sat', 'Sun'].includes(d.day));
    const weekendAvg = impulseDays.reduce((s, d) => s + d.avg, 0) / 3;
    const weekdayAvg = dayOfWeek.filter((d) => ['Mon', 'Tue', 'Wed', 'Thu'].includes(d.day)).reduce((s, d) => s + d.avg, 0) / 4;
    const insight = this.buildInsight(topCat, avgMonthly, weekendAvg > weekdayAvg * 1.3, categories, traits);

    return { totalAnalyzed, monthsAnalyzed, avgMonthly, categories, traits, heatmap, dayOfWeek, topMerchants, insight };
  }

  private computeTraits(categories: CategorySlice[], _avgMonthly: number, _totalAnalyzed: number, dayOfWeek: DayOfWeekPattern[]): SpendingTrait[] {
    const foodCats = categories.filter((c) => /food|dining|restaurant|eat|groceri|cafe|coffee/i.test(c.name));
    const foodPct = foodCats.reduce((s, c) => s + c.pct, 0);

    const stableCount = categories.filter((c) => c.trend === 'stable').length;
    const plannerScore = categories.length > 0 ? (stableCount / categories.length) * 100 : 50;

    const weekendAvg = dayOfWeek.filter((d) => ['Fri','Sat','Sun'].includes(d.day)).reduce((s, d) => s + d.avg, 0) / 3;
    const weekdayAvg = dayOfWeek.filter((d) => ['Mon','Tue','Wed','Thu'].includes(d.day)).reduce((s, d) => s + d.avg, 0) / 4;
    const impulseScore = weekdayAvg > 0 ? Math.min(100, ((weekendAvg - weekdayAvg) / weekdayAvg) * 150 + 20) : 20;

    const luxuryCats = categories.filter((c) => /entertain|shopping|luxury|travel|hotel|fashion/i.test(c.name));
    const luxuryPct = luxuryCats.reduce((s, c) => s + c.pct, 0);
    const saverScore = Math.max(0, 100 - luxuryPct * 2);

    const subCats = categories.filter((c) => /subscription|streaming|software|tech|digital|app/i.test(c.name));
    const subPct = subCats.reduce((s, c) => s + c.pct, 0);

    return [
      { id: 'foodie',     label: 'Foodie',       description: `${foodPct.toFixed(0)}% of spend on food & dining`, score: Math.min(100, foodPct * 2.5), icon: '🍽️' },
      { id: 'planner',    label: 'Planner',       description: plannerScore >= 60 ? 'Consistent and predictable spending' : 'Spending varies month to month', score: plannerScore, icon: '📋' },
      { id: 'impulse',    label: 'Impulse Buyer', description: impulseScore >= 60 ? 'Significant weekend spending spikes' : 'Spending is spread evenly across the week', score: Math.max(0, impulseScore), icon: '⚡' },
      { id: 'saver',      label: 'Saver',         description: saverScore >= 60 ? 'Low discretionary spending' : 'High discretionary spending detected', score: saverScore, icon: '🐷' },
      { id: 'subscriber', label: 'Subscriber',    description: `${subPct.toFixed(0)}% of spend on subscriptions & tech`, score: Math.min(100, subPct * 4), icon: '📱' },
    ];
  }

  private buildInsight(topCat: CategorySlice | undefined, _avgMonthly: number, weekendBias: boolean, categories: CategorySlice[], traits: SpendingTrait[]): string {
    const lines: string[] = [];
    if (topCat) {
      lines.push(`Your biggest spending category is **${topCat.name}** at ${topCat.pct.toFixed(1)}% of total spend — averaging **$${topCat.avgMonthly.toFixed(0)}/month**.`);
      if (topCat.trend === 'up') lines.push('This category has been trending up recently — worth keeping an eye on.');
      if (topCat.trend === 'down') lines.push('The good news: this category is trending down.');
    }
    if (weekendBias) {
      lines.push('You tend to spend significantly more on **weekends** — a classic impulse pattern. Consider setting a weekly "fun money" budget.');
    }
    const upTrending = categories.filter((c) => c.trend === 'up').map((c) => c.name);
    if (upTrending.length > 0) lines.push(`Categories trending upward: **${upTrending.slice(0, 2).join(', ')}**.`);
    const topTrait = [...traits].sort((a, b) => b.score - a.score)[0];
    if (topTrait && topTrait.score >= 60) lines.push(`Your top spending trait is **${topTrait.label}** — ${topTrait.description.toLowerCase()}.`);
    return lines.join(' ') || 'Keep tracking your spending to unlock deeper insights.';
  }

  private emptyResult(): SpendingDnaResult {
    return { totalAnalyzed: 0, monthsAnalyzed: 0, avgMonthly: 0, categories: [], traits: [], heatmap: [], dayOfWeek: [], topMerchants: [], insight: 'Add some transactions to unlock your Spending DNA.' };
  }
}
