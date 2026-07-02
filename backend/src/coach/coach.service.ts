import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Response } from 'express';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
import { Debt } from '../entities/debt.entity';
import { User } from '../entities/user.entity';
import { toNum, calcMonthlyIncome } from '../common/db.helpers';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Insight {
  id: string;
  type: 'alert' | 'tip' | 'win';
  category: 'spending' | 'debt' | 'savings' | 'budget' | 'income';
  title: string;
  description: string;
  link?: string;
  priority: number;
}

export interface AnswerMetric {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

export interface QuestionAnswer {
  questionId: string;
  question: string;
  answer: string;
  metrics?: AnswerMetric[];
  link?: string;
}

@Injectable()
export class CoachService {
  private readonly anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

  constructor(
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Budget)
    private readonly budgets: Repository<Budget>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async streamChat(userId: string, messages: ChatMessage[], res: Response) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
      res.status(503).json({ error: 'Anthropic API key not configured.' });
      return;
    }

    let systemPrompt: string;
    try {
      const context = await this.buildContext(userId);
      systemPrompt = this.buildSystemPrompt(context);
    } catch (err) {
      console.error('[CoachService] buildContext error:', err);
      res.status(500).json({ error: 'Failed to load financial context.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const stream = this.anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[CoachService] stream error:', err);
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  }

  private async buildContext(userId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [incomeRows, txRows, budgetRows, debtRows, user] = await Promise.all([
      this.incomes.find({ where: { userId, isActive: true }, select: ['source', 'amount', 'frequency', 'type'] }),
      this.transactions.find({
        where: { userId, date: Between(new Date(year, month - 1, 1), new Date(year, month, 0, 23, 59, 59, 999)) },
        relations: ['category'],
        order: { date: 'DESC' },
        take: 50,
      }),
      this.budgets.find({ where: { userId, month, year }, relations: ['category'] }),
      this.debts.find({ where: { userId, isPaidOff: false }, select: ['name', 'type', 'balance', 'apr', 'minimumPayment'] }),
      this.users.findOne({ where: { id: userId }, select: ['name', 'currency'] }),
    ]);

    const monthlyIncome = calcMonthlyIncome(incomeRows);
    const totalSpend = txRows.reduce((s, t) => s + toNum(t.amount), 0);
    const totalDebt = debtRows.reduce((s, d) => s + toNum(d.balance), 0);

    return {
      user,
      monthlyIncome,
      totalSpend,
      savings: monthlyIncome - totalSpend,
      savingsRate: monthlyIncome > 0 ? ((monthlyIncome - totalSpend) / monthlyIncome) * 100 : 0,
      transactionCount: txRows.length,
      topCategories: this.getTopCategories(txRows),
      budgets: budgetRows.map((b) => ({
        category: (b as typeof b & { category?: { name: string } }).category?.name ?? b.categoryId,
        budgeted: toNum(b.amount),
      })),
      debts: debtRows.map((d) => ({
        name: d.name, type: d.type,
        balance: toNum(d.balance), apr: toNum(d.apr), minimumPayment: toNum(d.minimumPayment),
      })),
      totalDebt,
      month: now.toLocaleString('default', { month: 'long' }),
      year,
    };
  }

  private getTopCategories(transactions: Array<{ amount: unknown; category: { name: string } | null }>) {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      const cat = t.category?.name ?? 'Uncategorised';
      map[cat] = (map[cat] ?? 0) + toNum(t.amount);
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({ name, total }));
  }

  /* ─── Rule-based insights ──────────────────────────────────── */

  async getInsights(userId: string): Promise<Insight[]> {
    try {
      const ctx = await this.buildInsightContext(userId);
      return this.generateInsights(ctx);
    } catch (err) {
      console.error('[CoachService] getInsights error:', err);
      return [];
    }
  }

  private async buildInsightContext(userId: string) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [incomeRows, txRows, budgetRows, debtRows, user] = await Promise.all([
      this.incomes.find({ where: { userId, isActive: true } }),
      this.transactions.find({
        where: { userId, date: Between(new Date(year, month - 1, 1), new Date(year, month, 0, 23, 59, 59, 999)) },
        relations: ['category'],
      }),
      this.budgets.find({ where: { userId, month, year }, relations: ['category'] }),
      this.debts.find({
        where: { userId, isPaidOff: false },
        select: ['name', 'type', 'balance', 'originalAmount', 'apr', 'minimumPayment'],
      }),
      this.users.findOne({ where: { id: userId }, select: ['name', 'currency'] }),
    ]);

    const monthlyIncome = calcMonthlyIncome(incomeRows);
    const totalSpend = txRows.reduce((s, t) => s + toNum(t.amount), 0);

    // Spend grouped by categoryId
    const spendByCatId: Record<string, { name: string; total: number }> = {};
    for (const t of txRows) {
      if (!t.categoryId) continue;
      const name = t.category?.name ?? t.categoryId;
      if (!spendByCatId[t.categoryId]) spendByCatId[t.categoryId] = { name, total: 0 };
      spendByCatId[t.categoryId].total += toNum(t.amount);
    }

    const budgetCatIds = new Set(budgetRows.map((b) => b.categoryId));

    const budgetVsActual = budgetRows.map((b) => {
      const spent = spendByCatId[b.categoryId]?.total ?? 0;
      const budgeted = toNum(b.amount);
      return {
        category: (b.category as unknown as { name: string })?.name ?? b.categoryId,
        budgeted,
        spent,
        pct: budgeted > 0 ? (spent / budgeted) * 100 : 0,
      };
    });

    const unbudgetedCategories = Object.entries(spendByCatId)
      .filter(([catId]) => !budgetCatIds.has(catId))
      .map(([, { name, total }]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    const debts = debtRows.map((d) => ({
      name: d.name,
      type: d.type,
      balance: toNum(d.balance),
      originalAmount: toNum(d.originalAmount),
      apr: toNum(d.apr),
      minimumPayment: toNum(d.minimumPayment),
    }));

    return {
      currency: user?.currency ?? 'INR',
      monthlyIncome,
      totalSpend,
      savings: monthlyIncome - totalSpend,
      savingsRate: monthlyIncome > 0 ? ((monthlyIncome - totalSpend) / monthlyIncome) * 100 : 0,
      budgetVsActual,
      unbudgetedCategories,
      debts,
      totalDebt: debts.reduce((s, d) => s + d.balance, 0),
      topCategories: Object.values(spendByCatId).sort((a, b) => b.total - a.total).slice(0, 5),
      month: now.toLocaleString('default', { month: 'long' }),
      year,
    };
  }

  private generateInsights(ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>): Insight[] {
    const insights: Insight[] = [];
    const fmt = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: ctx.currency, maximumFractionDigits: 0 }).format(n);

    // ── Alerts ────────────────────────────────────────────────────
    if (ctx.monthlyIncome === 0) {
      insights.push({
        id: 'no-income',
        type: 'alert',
        category: 'income',
        title: 'No income configured',
        description: 'Add your income sources so your coach can calculate savings rate, budget headroom, and personalised advice.',
        link: '/spending',
        priority: 100,
      });
    }

    if (ctx.monthlyIncome > 0 && ctx.totalSpend > ctx.monthlyIncome) {
      const over = ctx.totalSpend - ctx.monthlyIncome;
      insights.push({
        id: 'over-income',
        type: 'alert',
        category: 'spending',
        title: 'Spending exceeds income',
        description: `You've spent ${fmt(over)} more than you earned this month. Review your largest categories to find cuts.`,
        link: '/spending',
        priority: 95,
      });
    }

    if (ctx.monthlyIncome > 0 && ctx.savingsRate < 0) {
      insights.push({
        id: 'negative-savings',
        type: 'alert',
        category: 'savings',
        title: 'Negative savings this month',
        description: `Your spending is ${fmt(Math.abs(ctx.savings))} over your income. This depletes savings or adds debt.`,
        link: '/spending',
        priority: 92,
      });
    }

    for (const b of ctx.budgetVsActual) {
      if (b.pct > 130) {
        insights.push({
          id: `overbudget-alert-${b.category}`,
          type: 'alert',
          category: 'budget',
          title: `${b.category} is way over budget`,
          description: `Spent ${fmt(b.spent)} against a ${fmt(b.budgeted)} budget — ${Math.round(b.pct - 100)}% over. Consider adjusting your limits.`,
          link: '/spending',
          priority: 85,
        });
      }
    }

    // ── Tips ──────────────────────────────────────────────────────
    const monthlyInterest = ctx.debts.reduce((s, d) => s + d.balance * (d.apr / 100) / 12, 0);
    if (monthlyInterest > 200) {
      insights.push({
        id: 'high-interest',
        type: 'tip',
        category: 'debt',
        title: `You're paying ${fmt(monthlyInterest)}/month in interest`,
        description: `That's ${fmt(monthlyInterest * 12)}/year going to lenders. Extra payments toward your highest-APR debt reduce this fastest.`,
        link: '/debts',
        priority: 80,
      });
    }

    if (ctx.debts.length > 1) {
      const sorted = [...ctx.debts].sort((a, b) => b.apr - a.apr);
      const top = sorted[0];
      const annualInterest = top.balance * (top.apr / 100);
      insights.push({
        id: 'avalanche-tip',
        type: 'tip',
        category: 'debt',
        title: `Pay ${top.name} first — highest APR at ${top.apr}%`,
        description: `Clearing this debt first saves roughly ${fmt(annualInterest)}/year in interest vs paying lower-rate debts first.`,
        link: '/debts',
        priority: 75,
      });
    }

    if (ctx.monthlyIncome > 0 && ctx.savingsRate >= 0 && ctx.savingsRate < 10) {
      insights.push({
        id: 'savings-low',
        type: 'tip',
        category: 'savings',
        title: `Savings rate is low: ${ctx.savingsRate.toFixed(1)}%`,
        description: `You're saving ${fmt(ctx.savings)} this month. Even redirecting an extra ${fmt(ctx.monthlyIncome * 0.05)} builds a meaningful buffer over time.`,
        priority: 72,
      });
    }

    if (ctx.monthlyIncome > 0 && ctx.savingsRate >= 10 && ctx.savingsRate < 20) {
      insights.push({
        id: 'savings-ok',
        type: 'tip',
        category: 'savings',
        title: `Savings rate: ${ctx.savingsRate.toFixed(1)}% — room to grow`,
        description: `You're saving ${fmt(ctx.savings)}/month. Aim for 20% by trimming one spending category or channelling a raise directly to savings.`,
        priority: 58,
      });
    }

    for (const b of ctx.budgetVsActual) {
      if (b.pct > 100 && b.pct <= 130) {
        insights.push({
          id: `overbudget-tip-${b.category}`,
          type: 'tip',
          category: 'budget',
          title: `${b.category} slightly over budget`,
          description: `Spent ${fmt(b.spent)} vs ${fmt(b.budgeted)} budgeted (${Math.round(b.pct - 100)}% over). A small habit change can bring this back next month.`,
          link: '/spending',
          priority: 55,
        });
      }
    }

    if (ctx.unbudgetedCategories.length > 0) {
      const names = ctx.unbudgetedCategories.slice(0, 3).map((c) => c.name).join(', ');
      insights.push({
        id: 'unbudgeted-categories',
        type: 'tip',
        category: 'budget',
        title: `${ctx.unbudgetedCategories.length} categories have no budget`,
        description: `Categories like ${names} have real spending but no limit set. Adding budgets helps you spot overruns before they happen.`,
        link: '/spending',
        priority: 50,
      });
    }

    if (ctx.debts.length === 1) {
      const d = ctx.debts[0];
      const extraPmt = Math.round(d.minimumPayment * 0.15);
      insights.push({
        id: 'single-debt-extra',
        type: 'tip',
        category: 'debt',
        title: `Add ${fmt(extraPmt)}/month extra to ${d.name}`,
        description: `Even a 15% payment boost on your only debt meaningfully shortens the payoff timeline and reduces total interest paid.`,
        link: '/debts',
        priority: 60,
      });
    }

    // ── Wins ──────────────────────────────────────────────────────
    if (ctx.monthlyIncome > 0 && ctx.savingsRate >= 20) {
      insights.push({
        id: 'savings-win',
        type: 'win',
        category: 'savings',
        title: `Excellent savings rate: ${ctx.savingsRate.toFixed(1)}%`,
        description: `You're saving ${fmt(ctx.savings)} this month — well above the 20% target. This compounds into real financial freedom.`,
        priority: 70,
      });
    }

    const overBudgetCount = ctx.budgetVsActual.filter((b) => b.spent > b.budgeted).length;
    if (ctx.budgetVsActual.length >= 2 && overBudgetCount === 0) {
      insights.push({
        id: 'all-budgets-ok',
        type: 'win',
        category: 'budget',
        title: 'All budgets on track',
        description: `You're within budget across all ${ctx.budgetVsActual.length} categories this month. Great discipline — keep the streak going.`,
        priority: 65,
      });
    }

    for (const d of ctx.debts) {
      if (d.originalAmount > 0) {
        const paidPct = ((d.originalAmount - d.balance) / d.originalAmount) * 100;
        if (paidPct >= 85) {
          insights.push({
            id: `almost-paid-${d.name}`,
            type: 'win',
            category: 'debt',
            title: `Almost done with ${d.name}!`,
            description: `You've paid off ${paidPct.toFixed(0)}% — only ${fmt(d.balance)} left. One final push and this debt is gone.`,
            link: '/debts',
            priority: 82,
          });
        }
      }
    }

    if (ctx.debts.length === 0 && ctx.totalDebt === 0) {
      insights.push({
        id: 'debt-free',
        type: 'win',
        category: 'debt',
        title: 'You have no active debts',
        description: 'You carry zero debt right now. Channel what would have been payments toward your savings goals.',
        priority: 90,
      });
    }

    return insights.sort((a, b) => b.priority - a.priority);
  }

  /* ─── Q&A engine ────────────────────────────────────────────── */

  async answerQuestion(userId: string, questionId: string): Promise<QuestionAnswer> {
    const ctx = await this.buildInsightContext(userId);
    const fmt = (n: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: ctx.currency, maximumFractionDigits: 0 }).format(n);

    switch (questionId) {
      case 'which-debt-first':    return this.qaWhichDebtFirst(ctx, fmt);
      case 'savings-rate':        return this.qaSavingsRate(ctx, fmt);
      case 'budget-status':       return this.qaBudgetStatus(ctx, fmt);
      case 'debt-free-date':      return this.qaDebtFreeDate(ctx, fmt);
      case 'top-spending':        return this.qaTopSpending(ctx, fmt);
      case 'monthly-interest':    return this.qaMonthlyInterest(ctx, fmt);
      case 'income-vs-expense':   return this.qaIncomeVsExpense(ctx, fmt);
      case 'debt-progress':       return this.qaDebtProgress(ctx, fmt);
      default:
        return { questionId, question: 'Unknown question', answer: 'This question is not recognised.' };
    }
  }

  private qaWhichDebtFirst(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'Which debt should I pay off first?';
    if (ctx.debts.length === 0) {
      return { questionId: 'which-debt-first', question: q, answer: "Great news — you have no active debts right now. Focus on building your savings and emergency fund." };
    }
    if (ctx.debts.length === 1) {
      const d = ctx.debts[0];
      return {
        questionId: 'which-debt-first', question: q,
        answer: `You only have one active debt: ${d.name}. Put every extra rupee here to clear it faster.`,
        metrics: [{ label: d.name, value: fmt(d.balance), sub: `${d.apr}% APR`, highlight: true }],
        link: '/debts',
      };
    }
    const byApr = [...ctx.debts].sort((a, b) => b.apr - a.apr);
    const top = byApr[0];
    const annualSaving = top.balance * (top.apr / 100);
    return {
      questionId: 'which-debt-first', question: q,
      answer: `Use the avalanche method — pay minimums on everything, then throw all extra money at ${top.name} (${top.apr}% APR). Clearing it first saves you roughly ${fmt(annualSaving)} per year in interest. Here are your debts ordered by priority:`,
      metrics: byApr.map((d, i) => ({
        label: `${i + 1}. ${d.name}`,
        value: fmt(d.balance),
        sub: `${d.apr}% APR`,
        highlight: i === 0,
      })),
      link: '/debts',
    };
  }

  private qaSavingsRate(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = "What's my savings rate this month?";
    if (ctx.monthlyIncome === 0) {
      return { questionId: 'savings-rate', question: q, answer: "You haven't configured any income yet. Add your income sources in Spending so I can calculate your savings rate.", link: '/spending' };
    }
    const rate = ctx.savingsRate;
    const verdict =
      rate >= 20 ? "Excellent! You're comfortably above the recommended 20%." :
      rate >= 10 ? "You're on the right track. Aim to push this above 20%." :
      rate > 0   ? "This is below the healthy 10–20% range. Look for one category to cut." :
                   "You're spending more than you earn this month — address this urgently.";
    return {
      questionId: 'savings-rate', question: q,
      answer: `Your savings rate this month is ${rate.toFixed(1)}%. ${verdict}`,
      metrics: [
        { label: 'Monthly income',  value: fmt(ctx.monthlyIncome) },
        { label: 'Total spending',  value: fmt(ctx.totalSpend) },
        { label: 'Saved this month', value: fmt(ctx.savings), highlight: true },
        { label: 'Savings rate',    value: `${rate.toFixed(1)}%`, highlight: true },
      ],
    };
  }

  private qaBudgetStatus(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'Am I on track with my budget?';
    if (ctx.budgetVsActual.length === 0) {
      return { questionId: 'budget-status', question: q, answer: "You haven't set any budgets yet. Add budgets on the Spending page and I'll track them for you.", link: '/spending' };
    }
    const over  = ctx.budgetVsActual.filter(b => b.spent > b.budgeted);
    const under = ctx.budgetVsActual.filter(b => b.spent <= b.budgeted);
    const verdict = over.length === 0
      ? `All ${ctx.budgetVsActual.length} budget categories are within limit — great discipline!`
      : `${over.length} of ${ctx.budgetVsActual.length} categories are over budget.`;
    return {
      questionId: 'budget-status', question: q,
      answer: verdict,
      metrics: [
        { label: 'On track',   value: `${under.length} categories` },
        { label: 'Over budget', value: `${over.length} categories`, highlight: over.length > 0 },
        ...over.slice(0, 3).map(b => ({
          label: b.category,
          value: fmt(b.spent),
          sub: `Budget: ${fmt(b.budgeted)}`,
          highlight: true,
        })),
      ],
      link: '/spending',
    };
  }

  private qaDebtFreeDate(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'When will I be debt-free?';
    if (ctx.debts.length === 0) {
      return { questionId: 'debt-free-date', question: q, answer: "You're already debt-free! Direct those would-be payments toward your savings goals." };
    }
    const months = this.simulatePayoff(ctx.debts);
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    const dateStr = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const totalMinPayment = ctx.debts.reduce((s, d) => s + d.minimumPayment, 0);
    const totalInterest = ctx.debts.reduce((s, d) => s + d.balance * (d.apr / 100) / 12 * months, 0);
    return {
      questionId: 'debt-free-date', question: q,
      answer: `At your current minimum payments, you'll be debt-free by approximately ${dateStr} (${months} months). Paying even a little extra each month brings that date forward significantly.`,
      metrics: [
        { label: 'Total debt',         value: fmt(ctx.totalDebt) },
        { label: 'Monthly payments',   value: fmt(totalMinPayment) },
        { label: 'Estimated months',   value: `${months} mo`, highlight: true },
        { label: 'Debt-free by',       value: dateStr, highlight: true },
        { label: 'Est. interest left', value: fmt(totalInterest) },
      ],
      link: '/debts',
    };
  }

  private qaTopSpending(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'Where am I spending the most?';
    if (ctx.topCategories.length === 0) {
      return { questionId: 'top-spending', question: q, answer: `No transactions recorded for ${ctx.month} yet. Add your spending to see a breakdown.`, link: '/spending' };
    }
    const top = ctx.topCategories[0];
    const topPct = ctx.totalSpend > 0 ? ((top.total / ctx.totalSpend) * 100).toFixed(0) : '0';
    return {
      questionId: 'top-spending', question: q,
      answer: `Your biggest spend this month is ${top.name} at ${fmt(top.total)} (${topPct}% of total spending). Here are your top categories:`,
      metrics: ctx.topCategories.map((c, i) => ({
        label: `${i + 1}. ${c.name}`,
        value: fmt(c.total),
        sub: ctx.totalSpend > 0 ? `${((c.total / ctx.totalSpend) * 100).toFixed(0)}% of spend` : undefined,
        highlight: i === 0,
      })),
      link: '/spending',
    };
  }

  private qaMonthlyInterest(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'How much interest am I paying monthly?';
    if (ctx.debts.length === 0) {
      return { questionId: 'monthly-interest', question: q, answer: "You're not paying any interest — you have no active debts. Well done!" };
    }
    const withInterest = ctx.debts.map(d => ({ ...d, monthlyInterest: d.balance * (d.apr / 100) / 12 }));
    const total = withInterest.reduce((s, d) => s + d.monthlyInterest, 0);
    return {
      questionId: 'monthly-interest', question: q,
      answer: `You're paying ${fmt(total)}/month in interest across all debts — that's ${fmt(total * 12)}/year. Reducing high-APR balances is the fastest way to lower this.`,
      metrics: [
        ...withInterest.map(d => ({
          label: d.name,
          value: `${fmt(d.monthlyInterest)}/mo`,
          sub: `${d.apr}% APR on ${fmt(d.balance)}`,
          highlight: d.apr === Math.max(...ctx.debts.map(x => x.apr)),
        })),
        { label: 'Total monthly interest', value: fmt(total), highlight: true },
      ],
      link: '/debts',
    };
  }

  private qaIncomeVsExpense(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'How does my income compare to expenses?';
    if (ctx.monthlyIncome === 0) {
      return { questionId: 'income-vs-expense', question: q, answer: "No income configured. Add your income sources to see how it compares to spending.", link: '/spending' };
    }
    const surplus = ctx.savings >= 0;
    const ratio = ctx.totalSpend > 0 ? (ctx.monthlyIncome / ctx.totalSpend).toFixed(2) : '∞';
    const verdict = surplus
      ? `You're living within your means — ${fmt(ctx.savings)} surplus this month.`
      : `You're spending ${fmt(Math.abs(ctx.savings))} more than you earn. Find areas to cut back.`;
    return {
      questionId: 'income-vs-expense', question: q,
      answer: verdict,
      metrics: [
        { label: 'Income',           value: fmt(ctx.monthlyIncome) },
        { label: 'Expenses',         value: fmt(ctx.totalSpend) },
        { label: surplus ? 'Surplus' : 'Deficit', value: fmt(Math.abs(ctx.savings)), highlight: true },
        { label: 'Income/expense ratio', value: `${ratio}×` },
      ],
    };
  }

  private qaDebtProgress(
    ctx: Awaited<ReturnType<CoachService['buildInsightContext']>>,
    fmt: (n: number) => string,
  ): QuestionAnswer {
    const q = 'How much of my debt have I paid off?';
    if (ctx.debts.length === 0) {
      return { questionId: 'debt-progress', question: q, answer: "You have no active debts! All clear." };
    }
    const totalOriginal = ctx.debts.reduce((s, d) => s + d.originalAmount, 0);
    const totalPaid = totalOriginal - ctx.totalDebt;
    const paidPct = totalOriginal > 0 ? (totalPaid / totalOriginal) * 100 : 0;
    return {
      questionId: 'debt-progress', question: q,
      answer: `You've paid off ${fmt(totalPaid)} (${paidPct.toFixed(0)}%) of your total debt so far. Keep going!`,
      metrics: [
        { label: 'Original total debt', value: fmt(totalOriginal) },
        { label: 'Paid off',            value: fmt(totalPaid), highlight: true },
        { label: 'Remaining',           value: fmt(ctx.totalDebt) },
        { label: 'Progress',            value: `${paidPct.toFixed(0)}%`, highlight: true },
        ...ctx.debts.map(d => {
          const paid = d.originalAmount > 0 ? ((d.originalAmount - d.balance) / d.originalAmount) * 100 : 0;
          return { label: d.name, value: `${paid.toFixed(0)}% paid`, sub: `${fmt(d.balance)} left` };
        }),
      ],
      link: '/debts',
    };
  }

  private simulatePayoff(debts: { balance: number; apr: number; minimumPayment: number }[]): number {
    const balances = debts.map(d => d.balance);
    let months = 0;
    while (balances.some(b => b > 1) && months < 600) {
      for (let i = 0; i < debts.length; i++) {
        if (balances[i] <= 0) continue;
        const interest = balances[i] * (debts[i].apr / 100) / 12;
        balances[i] = Math.max(0, balances[i] + interest - debts[i].minimumPayment);
      }
      months++;
    }
    return months;
  }

  private buildSystemPrompt(ctx: {
    user: { name: string | null; currency: string } | null;
    monthlyIncome: number; totalSpend: number; savings: number; savingsRate: number;
    transactionCount: number; topCategories: { name: string; total: number }[];
    budgets: { category: string; budgeted: number }[];
    debts: { name: string; type: string; balance: number; apr: number; minimumPayment: number }[];
    totalDebt: number; month: string; year: number;
  }) {
    const currency = ctx.user?.currency ?? 'USD';
    const fmt = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

    const debtLines = ctx.debts.length
      ? ctx.debts.map((d) => `  • ${d.name} (${d.type}): ${fmt(d.balance)} @ ${d.apr}% APR, min payment ${fmt(d.minimumPayment)}`).join('\n')
      : '  None';
    const budgetLines = ctx.budgets.length
      ? ctx.budgets.map((b) => `  • ${b.category}: budgeted ${fmt(b.budgeted)}`).join('\n')
      : '  No budgets set';
    const categoryLines = ctx.topCategories.length
      ? ctx.topCategories.map((c) => `  • ${c.name}: ${fmt(c.total)}`).join('\n')
      : '  No transactions yet';

    return `You are Harmony Coach, a warm, knowledgeable, and encouraging personal finance advisor embedded in the Harmony app. Your role is to help the user understand their finances, make better decisions, and build healthy money habits — without judgment.

## User Financial Snapshot (${ctx.month} ${ctx.year})
- Name: ${ctx.user?.name ?? 'User'}
- Currency: ${currency}
- Monthly Income: ${fmt(ctx.monthlyIncome)}
- This month's spending: ${fmt(ctx.totalSpend)} across ${ctx.transactionCount} transactions
- Savings this month: ${fmt(ctx.savings)} (${ctx.savingsRate.toFixed(1)}% savings rate)

### Top Spending Categories
${categoryLines}

### Active Budgets
${budgetLines}

### Outstanding Debts
${debtLines}
- Total debt: ${fmt(ctx.totalDebt)}

## Guidance
- Be concise, warm, and actionable. Prefer 2-3 sentence answers unless depth is needed.
- Reference the user's actual numbers when giving advice.
- For debt advice, consider avalanche (highest APR first) vs snowball (smallest balance first) strategies.
- Celebrate wins and frame challenges constructively.
- Never make specific investment recommendations for individual securities.
- If asked something outside personal finance, gently redirect.
- Use markdown for structure only when the response is genuinely list-like or has multiple sections.`;
  }
}
