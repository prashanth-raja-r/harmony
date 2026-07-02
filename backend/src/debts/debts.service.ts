import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { generateId, toNum } from '../common/db.helpers';

export interface CreateDebtDto {
  name: string;
  type: string;
  balance: number;
  originalAmount: number;
  apr: number;
  minimumPayment: number;
  termMonths?: number;
  dueDate: number;
  lender?: string;
  startDate: string;
}

export interface UpdateDebtDto {
  name?: string;
  type?: string;
  balance?: number;
  apr?: number;
  minimumPayment?: number;
  termMonths?: number;
  dueDate?: number;
  lender?: string;
}

export interface AddPaymentDto {
  amount: number;
  paymentDate: string;
  note?: string;
}

/**
 * Yearly-renewal debt types charge interest only once at annual renewal.
 * Overdraft facilities and Jewel/Gold loans typically renew yearly.
 */
const YEARLY_RENEWAL_TYPES = new Set(['OVERDRAFT', 'JEWEL_LOAN']);
function isYearlyRenewal(type: string): boolean {
  return YEARLY_RENEWAL_TYPES.has(type);
}

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly payments: Repository<DebtPayment>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string) {
    const rows = await this.debts.find({
      where: { userId },
      select: ['id', 'isPaidOff', 'balance'],
    });

    const full = (await Promise.all(
      rows.map((r) => this.loadDebtWithPayments(r.id, null)),
    )).filter((d): d is NonNullable<typeof d> => d !== null);

    full.sort((a, b) => {
      if (a.isPaidOff !== b.isPaidOff) return a.isPaidOff ? 1 : -1;
      return toNum(b.balance) - toNum(a.balance);
    });

    return full.map((d) => this.serialize(d));
  }

  async findOne(userId: string, id: string) {
    const debt = await this.loadDebtWithPayments(id, null);
    if (!debt) throw new NotFoundException('Debt not found.');
    if (debt.userId !== userId) throw new ForbiddenException();
    return this.serialize(debt);
  }

  async create(userId: string, dto: CreateDebtDto) {
    const debt = this.debts.create({
      id: generateId(),
      userId,
      name: dto.name,
      type: dto.type,
      balance: String(dto.balance),
      originalAmount: String(dto.originalAmount),
      apr: String(dto.apr),
      minimumPayment: String(dto.minimumPayment),
      termMonths: dto.termMonths ?? null,
      dueDate: dto.dueDate,
      lender: dto.lender ?? null,
      startDate: new Date(dto.startDate),
    });
    await this.debts.save(debt);
    const loaded = await this.loadDebtWithPayments(debt.id, 5);
    return this.serialize(loaded!);
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    await this.assertOwner(userId, id);
    const patch: Partial<Debt> = {};
    if (dto.name !== undefined)          patch.name = dto.name;
    if (dto.type !== undefined)          patch.type = dto.type;
    if (dto.balance !== undefined)       patch.balance = String(dto.balance);
    if (dto.apr !== undefined)           patch.apr = String(dto.apr);
    if (dto.minimumPayment !== undefined) patch.minimumPayment = String(dto.minimumPayment);
    if (dto.termMonths !== undefined)    patch.termMonths = dto.termMonths;
    if (dto.dueDate !== undefined)       patch.dueDate = dto.dueDate;
    if (dto.lender !== undefined)        patch.lender = dto.lender;
    await this.debts.update(id, patch);
    const loaded = await this.loadDebtWithPayments(id, 5);
    return this.serialize(loaded!);
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.debts.delete(id);
    return { deleted: true };
  }

  async markPaidOff(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.debts.update(id, { isPaidOff: true, balance: '0', paidOffAt: new Date() });
    const loaded = await this.loadDebtWithPayments(id, 5);
    return this.serialize(loaded!);
  }

  async undoPaidOff(userId: string, id: string) {
    await this.assertOwner(userId, id);
    const debt = await this.debts.findOne({
      where: { id },
      relations: ['payments'],
    });
    if (!debt) throw new NotFoundException('Debt not found.');
    const totalPrincipalPaid = debt.payments.reduce((s, p) => s + toNum(p.principalAmount), 0);
    const restoredBalance = Math.max(0, toNum(debt.originalAmount) - totalPrincipalPaid);
    await this.debts.update(id, { isPaidOff: false, paidOffAt: null, balance: String(restoredBalance) });
    const loaded = await this.loadDebtWithPayments(id, 5);
    return this.serialize(loaded!);
  }

  async addPayment(userId: string, debtId: string, dto: AddPaymentDto) {
    await this.assertOwner(userId, debtId);
    const debt = await this.debts.findOneBy({ id: debtId });
    if (!debt) throw new NotFoundException('Debt not found.');

    let interestAmount: number;
    let principalAmount: number;
    if (isYearlyRenewal(debt.type)) {
      interestAmount = 0;
      principalAmount = dto.amount;
    } else {
      const monthlyRate = toNum(debt.apr) / 100 / 12;
      interestAmount = toNum(debt.balance) * monthlyRate;
      principalAmount = Math.max(0, dto.amount - interestAmount);
    }
    const newBalance = Math.max(0, toNum(debt.balance) - principalAmount);

    const payment = this.payments.create({
      id: generateId(),
      debtId,
      amount: String(dto.amount),
      principalAmount: String(principalAmount),
      interestAmount: String(Math.min(interestAmount, dto.amount)),
      paymentDate: new Date(dto.paymentDate),
      note: dto.note ?? null,
    });

    const debtPatch: Partial<Debt> = {
      balance: String(newBalance),
      ...(newBalance === 0 ? { isPaidOff: true, paidOffAt: new Date() } : {}),
    };

    await this.dataSource.transaction(async (em) => {
      await em.save(payment);
      await em.update(Debt, { id: debtId }, debtPatch);
    });

    return {
      ...payment,
      amount: toNum(payment.amount),
      principalAmount: toNum(payment.principalAmount),
      interestAmount: toNum(payment.interestAmount),
      newBalance,
    };
  }

  async confirmEmi(userId: string, debtId: string) {
    await this.assertOwner(userId, debtId);
    const debt = await this.debts.findOneBy({ id: debtId });
    if (!debt) throw new NotFoundException('Debt not found.');
    if (isYearlyRenewal(debt.type)) {
      throw new Error('Yearly-renewal debts do not have monthly EMIs.');
    }

    const amount = toNum(debt.minimumPayment);
    const monthlyRate = toNum(debt.apr) / 100 / 12;
    const interestAmount = toNum(debt.balance) * monthlyRate;
    const principalAmount = Math.max(0, amount - interestAmount);
    const newBalance = Math.max(0, toNum(debt.balance) - principalAmount);

    const payment = this.payments.create({
      id: generateId(),
      debtId,
      amount: String(amount),
      principalAmount: String(principalAmount),
      interestAmount: String(Math.min(interestAmount, amount)),
      paymentDate: new Date(),
      note: 'EMI confirmed',
    });

    const debtPatch: Partial<Debt> = {
      balance: String(newBalance),
      ...(newBalance === 0 ? { isPaidOff: true, paidOffAt: new Date() } : {}),
    };

    await this.dataSource.transaction(async (em) => {
      await em.save(payment);
      await em.update(Debt, { id: debtId }, debtPatch);
    });

    return {
      ...payment,
      amount: toNum(payment.amount),
      principalAmount: toNum(payment.principalAmount),
      interestAmount: toNum(payment.interestAmount),
      newBalance,
    };
  }

  async getPayoffStrategies(userId: string) {
    const debts = await this.debts.find({
      where: { userId, isPaidOff: false },
      select: ['id', 'name', 'balance', 'apr', 'minimumPayment', 'type'],
    });

    if (!debts.length) return { avalanche: [], snowball: [], summary: { avalanche: null, snowball: null } };

    const totalMinimum = debts.reduce((s, d) => s + toNum(d.minimumPayment), 0);
    const extraPayment = totalMinimum * 0.2;
    const monthlyBudget = totalMinimum + extraPayment;

    return {
      avalanche: this.calcStrategy(debts, monthlyBudget, 'avalanche'),
      snowball: this.calcStrategy(debts, monthlyBudget, 'snowball'),
      monthlyBudget,
      totalMinimum,
    };
  }

  private calcStrategy(
    rawDebts: Array<{ id: string; name: string; balance: unknown; apr: unknown; minimumPayment: unknown; type: string }>,
    monthlyBudget: number,
    strategy: 'avalanche' | 'snowball',
  ) {
    type D = { id: string; name: string; balance: number; apr: number; minimumPayment: number; type: string; monthsToPayoff: number; totalInterest: number };

    let debts: D[] = rawDebts.map((d) => ({
      id: d.id,
      name: d.name,
      balance: toNum(d.balance),
      apr: toNum(d.apr),
      minimumPayment: toNum(d.minimumPayment),
      type: d.type,
      monthsToPayoff: 0,
      totalInterest: 0,
    }));

    debts = strategy === 'avalanche'
      ? [...debts].sort((a, b) => b.apr - a.apr)
      : [...debts].sort((a, b) => a.balance - b.balance);

    const results = debts.map((d) => ({ ...d }));
    const balances = debts.map((d) => d.balance);
    const interest = new Array<number>(debts.length).fill(0);
    let month = 0;
    const MAX_MONTHS = 600;

    while (balances.some((b) => b > 0) && month < MAX_MONTHS) {
      month++;
      let remaining = monthlyBudget;

      for (let i = 0; i < debts.length; i++) {
        if (balances[i]! <= 0) continue;
        let interestCharge: number;
        if (isYearlyRenewal(debts[i]!.type)) {
          interestCharge = month % 12 === 0 ? balances[i]! * (debts[i]!.apr / 100) : 0;
        } else {
          interestCharge = balances[i]! * (debts[i]!.apr / 100 / 12);
        }
        balances[i]! += interestCharge;
        const minPay = Math.min(debts[i]!.minimumPayment, balances[i]!);
        interest[i]! += interestCharge;
        balances[i] = Math.max(0, balances[i]! - minPay);
        remaining -= minPay;
        if (balances[i] === 0 && results[i]!.monthsToPayoff === 0) {
          results[i]!.monthsToPayoff = month;
          results[i]!.totalInterest = interest[i]!;
        }
      }

      for (let i = 0; i < debts.length && remaining > 0; i++) {
        if (balances[i]! <= 0) continue;
        const extra = Math.min(remaining, balances[i]!);
        balances[i] = Math.max(0, balances[i]! - extra);
        remaining -= extra;
        if (balances[i] === 0 && results[i]!.monthsToPayoff === 0) {
          results[i]!.monthsToPayoff = month;
          results[i]!.totalInterest = interest[i]!;
        }
      }
    }

    const totalMonths = Math.max(...results.map((r) => r.monthsToPayoff));
    const totalInterestPaid = results.reduce((s, r) => s + r.totalInterest, 0);

    return {
      order: results.map((r) => ({
        id: r.id, name: r.name, balance: r.balance, apr: r.apr,
        monthsToPayoff: r.monthsToPayoff, totalInterest: Math.round(r.totalInterest),
      })),
      totalMonths,
      totalInterestPaid: Math.round(totalInterestPaid),
      debtFreeDate: new Date(Date.now() + totalMonths * 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  private async loadDebtWithPayments(id: string, take: number | null) {
    const qb = this.debts.createQueryBuilder('d')
      .leftJoinAndSelect('d.payments', 'p')
      .where('d.id = :id', { id });
    if (take !== null) {
      qb.orderBy('p.paymentDate', 'DESC').take(take);
    } else {
      qb.orderBy('p.paymentDate', 'DESC');
    }
    return qb.getOne();
  }

  private serialize(debt: Debt & { payments?: DebtPayment[] }) {
    const payments = debt.payments ?? [];
    const termMonths = debt.termMonths ?? null;
    const yearly = isYearlyRenewal(debt.type);
    const startDate = debt.startDate instanceof Date ? debt.startDate : new Date(debt.startDate);
    const dueDay = debt.dueDate;
    let emiStartDate: Date | null = null;
    let emiEndDate: Date | null = null;

    if (!yearly) {
      const candidate = new Date(startDate.getFullYear(), startDate.getMonth(), dueDay);
      if (candidate < startDate) candidate.setMonth(candidate.getMonth() + 1);
      emiStartDate = candidate;
      if (termMonths !== null) {
        emiEndDate = new Date(emiStartDate);
        emiEndDate.setMonth(emiEndDate.getMonth() + termMonths - 1);
      }
    }

    let emisPaid = 0;
    let currentEmiNumber = 0;
    if (!yearly && emiStartDate) {
      const now = new Date();
      if (now >= emiStartDate) {
        const yearDiff = now.getFullYear() - emiStartDate.getFullYear();
        const monthDiff = now.getMonth() - emiStartDate.getMonth();
        const elapsed = yearDiff * 12 + monthDiff;
        const dueDayThisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay);
        emisPaid = now >= dueDayThisMonth ? elapsed + 1 : elapsed;
        if (termMonths !== null) emisPaid = Math.min(emisPaid, termMonths);
        currentEmiNumber = emisPaid;
      }
    }

    let confirmedPayments = 0;
    if (!yearly && emiStartDate) {
      const paidMonthKeys = new Set<string>();
      for (const p of payments) {
        const pd = new Date(p.paymentDate);
        if (pd >= emiStartDate) paidMonthKeys.add(`${pd.getFullYear()}-${pd.getMonth()}`);
      }
      confirmedPayments = paidMonthKeys.size;
    } else {
      confirmedPayments = payments.length;
    }

    const emisRemaining = termMonths !== null ? Math.max(0, termMonths - emisPaid) : null;
    const sortedPayments = [...payments].sort((a, b) =>
      new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime(),
    );
    const lastPaidDate = sortedPayments[0]?.paymentDate ? new Date(sortedPayments[0].paymentDate).toISOString() : null;

    let nextEmiDate: string | null = null;
    if (!debt.isPaidOff && !yearly) {
      const now = new Date();
      const candidate = new Date(now.getFullYear(), now.getMonth(), dueDay);
      if (candidate <= now) candidate.setMonth(candidate.getMonth() + 1);
      if (emiEndDate === null || candidate <= emiEndDate) {
        nextEmiDate = candidate.toISOString();
      }
    }

    return {
      ...debt,
      balance: toNum(debt.balance),
      originalAmount: toNum(debt.originalAmount),
      apr: toNum(debt.apr),
      minimumPayment: toNum(debt.minimumPayment),
      termMonths,
      paidPercent: toNum(debt.originalAmount) > 0
        ? ((toNum(debt.originalAmount) - toNum(debt.balance)) / toNum(debt.originalAmount)) * 100
        : 0,
      emiSummary: {
        totalEmis: termMonths,
        emisPaid,
        emisRemaining,
        currentEmiNumber,
        confirmedPayments,
        emiStartDate: emiStartDate ? emiStartDate.toISOString() : null,
        emiEndDate: emiEndDate ? emiEndDate.toISOString() : null,
        lastPaidDate,
        nextEmiDate,
      },
      payments: payments.map((p) => ({
        ...p,
        amount: toNum(p.amount),
        principalAmount: toNum(p.principalAmount),
        interestAmount: toNum(p.interestAmount),
      })),
      _count: { payments: payments.length },
    };
  }

  private async assertOwner(userId: string, debtId: string) {
    const debt = await this.debts.findOne({ where: { id: debtId }, select: ['userId'] });
    if (!debt) throw new NotFoundException('Debt not found.');
    if (debt.userId !== userId) throw new ForbiddenException();
  }
}
