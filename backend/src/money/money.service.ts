import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Income } from '../entities/income.entity';
import { Budget } from '../entities/budget.entity';
import { Category } from '../entities/category.entity';
import { generateId, toNum, calcMonthlyIncome } from '../common/db.helpers';

export interface CreateIncomeDto {
  source: string;
  type: string;
  amount: number;
  frequency: string;
  date: string;
  isActive?: boolean;
}

export interface CreateTransactionDto {
  amount: number;
  description: string;
  date: string;
  categoryId?: string;
  paymentMethod?: string;
  isRecurring?: boolean;
}

export interface CreateBudgetDto {
  categoryId: string;
  amount: number;
  month: number;
  year: number;
}

export interface TransactionFilters {
  month?: number;
  year?: number;
  categoryId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MoneyService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Budget)
    private readonly budgets: Repository<Budget>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async getMonthlySummary(userId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const [txRows, incomeRows, budgetRows, categoryRows] = await Promise.all([
      this.transactions.find({
        where: { userId, date: Between(start, end) },
        relations: ['category'],
        order: { date: 'DESC' },
      }),
      this.incomes.find({
        where: { userId, isActive: true },
        select: ['id', 'source', 'type', 'amount', 'frequency', 'date'],
      }),
      this.budgets.find({
        where: { userId, month, year },
        relations: ['category'],
      }),
      this.categories.find({
        where: [{ isSystem: true }, { userId }],
        select: ['id', 'name', 'icon', 'color'],
      }),
    ]);

    const totalSpend = txRows.reduce((s, t) => s + toNum(t.amount), 0);
    const monthlyIncome = calcMonthlyIncome(incomeRows);

    const byCategory = txRows.reduce<Record<string, { name: string; icon: string; color: string; total: number }>>((acc, t) => {
      const catId = t.categoryId ?? 'uncategorised';
      if (!acc[catId]) {
        acc[catId] = {
          name: t.category?.name ?? 'Uncategorised',
          icon: t.category?.icon ?? '💸',
          color: t.category?.color ?? '#64748b',
          total: 0,
        };
      }
      acc[catId]!.total += toNum(t.amount);
      return acc;
    }, {});

    const budgetStatus = budgetRows.map((b) => {
      const spent = byCategory[b.categoryId]?.total ?? 0;
      return {
        id: b.id,
        categoryId: b.categoryId,
        category: b.category,
        budgeted: toNum(b.amount),
        spent,
        remaining: toNum(b.amount) - spent,
        pct: toNum(b.amount) > 0 ? (spent / toNum(b.amount)) * 100 : 0,
      };
    });

    return {
      month, year,
      totalSpend,
      monthlyIncome,
      savings: monthlyIncome - totalSpend,
      savingsRate: monthlyIncome > 0 ? ((monthlyIncome - totalSpend) / monthlyIncome) * 100 : 0,
      transactionCount: txRows.length,
      byCategory: Object.entries(byCategory)
        .map(([id, v]) => ({ categoryId: id, ...v }))
        .sort((a, b) => b.total - a.total),
      budgetStatus,
      transactions: txRows.map((t) => ({ ...t, amount: toNum(t.amount), date: t.date.toISOString() })),
      categories: categoryRows,
    };
  }

  async getTransactions(userId: string, filters: TransactionFilters) {
    const { month, year, categoryId, page = 1, limit = 30 } = filters;
    const where: Parameters<Repository<Transaction>['findAndCount']>[0] = { where: { userId } };

    if (month && year) {
      (where.where as Record<string, unknown>)['date'] = Between(
        new Date(year, month - 1, 1),
        new Date(year, month, 0, 23, 59, 59, 999),
      );
    }
    if (categoryId) (where.where as Record<string, unknown>)['categoryId'] = categoryId;

    const [rows, total] = await this.transactions.findAndCount({
      where: where.where as never,
      relations: ['category'],
      order: { date: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      total,
      page,
      pages: Math.ceil(total / limit),
      data: rows.map((t) => ({ ...t, amount: toNum(t.amount), date: t.date.toISOString() })),
    };
  }

  async createTransaction(userId: string, dto: CreateTransactionDto) {
    const t = this.transactions.create({
      id: generateId(),
      userId,
      amount: String(dto.amount),
      description: dto.description,
      date: new Date(dto.date),
      categoryId: dto.categoryId ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      isRecurring: dto.isRecurring ?? false,
    });
    await this.transactions.save(t);
    const loaded = await this.transactions.findOne({ where: { id: t.id }, relations: ['category'] });
    return { ...loaded!, amount: toNum(loaded!.amount), date: loaded!.date.toISOString() };
  }

  async updateTransaction(userId: string, id: string, dto: Partial<CreateTransactionDto>) {
    await this.assertTransactionOwner(userId, id);
    const patch: Partial<Transaction> = {};
    if (dto.amount !== undefined)        patch.amount = String(dto.amount);
    if (dto.description !== undefined)   patch.description = dto.description;
    if (dto.date !== undefined)          patch.date = new Date(dto.date);
    if (dto.categoryId !== undefined)    patch.categoryId = dto.categoryId ?? null;
    if (dto.paymentMethod !== undefined) patch.paymentMethod = dto.paymentMethod ?? null;
    if (dto.isRecurring !== undefined)   patch.isRecurring = dto.isRecurring;
    await this.transactions.update(id, patch);
    const loaded = await this.transactions.findOne({ where: { id }, relations: ['category'] });
    return { ...loaded!, amount: toNum(loaded!.amount), date: loaded!.date.toISOString() };
  }

  async deleteTransaction(userId: string, id: string) {
    await this.assertTransactionOwner(userId, id);
    await this.transactions.delete(id);
    return { deleted: true };
  }

  async getIncomes(userId: string) {
    const rows = await this.incomes.find({
      where: { userId },
      order: { isActive: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((i) => ({ ...i, amount: toNum(i.amount), date: i.date.toISOString() }));
  }

  async createIncome(userId: string, dto: CreateIncomeDto) {
    const i = this.incomes.create({
      id: generateId(),
      userId,
      source: dto.source,
      type: dto.type,
      amount: String(dto.amount),
      frequency: dto.frequency,
      date: new Date(dto.date),
      isActive: dto.isActive ?? true,
    });
    await this.incomes.save(i);
    return { ...i, amount: toNum(i.amount), date: i.date.toISOString() };
  }

  async updateIncome(userId: string, id: string, dto: Partial<CreateIncomeDto>) {
    await this.assertIncomeOwner(userId, id);
    const patch: Partial<Income> = {};
    if (dto.source !== undefined)    patch.source = dto.source;
    if (dto.type !== undefined)      patch.type = dto.type;
    if (dto.amount !== undefined)    patch.amount = String(dto.amount);
    if (dto.frequency !== undefined) patch.frequency = dto.frequency;
    if (dto.date !== undefined)      patch.date = new Date(dto.date);
    if (dto.isActive !== undefined)  patch.isActive = dto.isActive;
    await this.incomes.update(id, patch);
    const loaded = await this.incomes.findOneBy({ id });
    return { ...loaded!, amount: toNum(loaded!.amount), date: loaded!.date.toISOString() };
  }

  async deleteIncome(userId: string, id: string) {
    await this.assertIncomeOwner(userId, id);
    await this.incomes.delete(id);
    return { deleted: true };
  }

  async getBudgets(userId: string, month: number, year: number) {
    const rows = await this.budgets.find({
      where: { userId, month, year },
      relations: ['category'],
    });
    return rows.map((b) => ({ ...b, amount: toNum(b.amount) }));
  }

  async upsertBudget(userId: string, dto: CreateBudgetDto) {
    let b = await this.budgets.findOne({
      where: { userId, categoryId: dto.categoryId, month: dto.month, year: dto.year },
    });
    if (b) {
      await this.budgets.update(b.id, { amount: String(dto.amount) });
      b.amount = String(dto.amount);
    } else {
      b = this.budgets.create({
        id: generateId(),
        userId,
        categoryId: dto.categoryId,
        amount: String(dto.amount),
        month: dto.month,
        year: dto.year,
      });
      await this.budgets.save(b);
    }
    const loaded = await this.budgets.findOne({ where: { id: b.id }, relations: ['category'] });
    return { ...loaded!, amount: toNum(loaded!.amount) };
  }

  async deleteBudget(userId: string, id: string) {
    const b = await this.budgets.findOne({ where: { id }, select: ['userId'] });
    if (!b) throw new NotFoundException('Budget not found.');
    if (b.userId !== userId) throw new ForbiddenException();
    await this.budgets.delete(id);
    return { deleted: true };
  }

  async getCategories(userId: string) {
    return this.categories.find({
      where: [{ isSystem: true }, { userId }],
      select: ['id', 'name', 'icon', 'color', 'isSystem'],
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  async getTrends(userId: string, months: number = 6) {
    const now = new Date();

    type MonthEntry = {
      label: string;
      monthNum: number;
      year: number;
      total: number;
      byCategory: Record<string, { name: string; icon: string; color: string; amount: number }>;
    };

    const monthData: MonthEntry[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthNum = d.getMonth() + 1;
      const year = d.getFullYear();
      const start = new Date(year, monthNum - 1, 1);
      const end = new Date(year, monthNum, 0, 23, 59, 59, 999);

      const txns = await this.transactions.find({
        where: { userId, date: Between(start, end) },
        relations: ['category'],
      });

      const byCategory: Record<string, { name: string; icon: string; color: string; amount: number }> = {};
      let total = 0;
      for (const t of txns) {
        const catId = t.categoryId ?? 'other';
        if (!byCategory[catId]) {
          byCategory[catId] = {
            name: t.category?.name ?? 'Other',
            icon: t.category?.icon ?? '💸',
            color: t.category?.color ?? '#64748b',
            amount: 0,
          };
        }
        byCategory[catId]!.amount += toNum(t.amount);
        total += toNum(t.amount);
      }

      const isCurrentYear = year === now.getFullYear();
      const shortMonth = new Date(year, monthNum - 1, 1).toLocaleString('en-IN', { month: 'short' });
      const label = isCurrentYear ? shortMonth : `${shortMonth} '${String(year).slice(2)}`;

      monthData.push({ label, monthNum, year, total, byCategory });
    }

    // Top categories by cumulative spend across all months
    const catTotals: Record<string, { name: string; icon: string; color: string; total: number }> = {};
    for (const m of monthData) {
      for (const [catId, cat] of Object.entries(m.byCategory)) {
        if (!catTotals[catId]) catTotals[catId] = { name: cat.name, icon: cat.icon, color: cat.color, total: 0 };
        catTotals[catId]!.total += cat.amount;
      }
    }

    const topCategories = Object.entries(catTotals)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 6)
      .map(([id, cat]) => ({ id, ...cat }));

    // Build chart data: one data point per month
    const chartData = monthData.map((m) => {
      const point: Record<string, string | number> = { month: m.label, total: m.total };
      for (const cat of topCategories) {
        point[cat.name] = m.byCategory[cat.id]?.amount ?? 0;
      }
      return point;
    });

    // Delta: current month vs previous month
    const current = monthData[monthData.length - 1];
    const previous = monthData[monthData.length - 2];

    const deltas = topCategories.map((cat) => {
      const curr = current?.byCategory[cat.id]?.amount ?? 0;
      const prev = previous?.byCategory[cat.id]?.amount ?? 0;
      const delta = curr - prev;
      const pct = prev > 0 ? (delta / prev) * 100 : curr > 0 ? 100 : 0;
      return { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, current: curr, previous: prev, delta, pct: Math.round(pct) };
    });

    return { chartData, categories: topCategories, deltas, monthLabels: monthData.map((m) => m.label) };
  }

  private async assertTransactionOwner(userId: string, id: string) {
    const t = await this.transactions.findOne({ where: { id }, select: ['userId'] });
    if (!t) throw new NotFoundException('Transaction not found.');
    if (t.userId !== userId) throw new ForbiddenException();
  }

  private async assertIncomeOwner(userId: string, id: string) {
    const i = await this.incomes.findOne({ where: { id }, select: ['userId'] });
    if (!i) throw new NotFoundException('Income not found.');
    if (i.userId !== userId) throw new ForbiddenException();
  }
}
