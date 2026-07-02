import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsOptional, IsString, IsNumber, IsArray, ValidateNested, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { User } from '../entities/user.entity';
import { Streak } from '../entities/streak.entity';
import { Income, IncomeFrequency, IncomeType } from '../entities/income.entity';
import { Debt } from '../entities/debt.entity';
import { generateId } from '../common/db.helpers';
import bcrypt from 'bcryptjs';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
}

export class OnboardDebtDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsNumber()
  balance: number;

  @IsNumber()
  @IsOptional()
  originalAmount?: number;

  @IsNumber()
  apr: number;

  @IsNumber()
  minimumPayment: number;

  @IsInt()
  @Min(1) @Max(31)
  dueDate: number;

  @IsInt()
  @IsOptional()
  termMonths?: number;

  @IsString()
  @IsOptional()
  lender?: string;
}

export class OnboardDto {
  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  monthlyIncome?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OnboardDebtDto)
  debts?: OnboardDebtDto[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Streak)
    private readonly streaks: Repository<Streak>,
    @InjectRepository(Income)
    private readonly incomes: Repository<Income>,
    @InjectRepository(Debt)
    private readonly debts: Repository<Debt>,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.users.findOne({
      where: { email: dto.email.toLowerCase() },
      select: ['id'],
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const userId = generateId();

    const user = this.users.create({
      id: userId,
      name: dto.name,
      email: dto.email.toLowerCase(),
      password: hashed,
    });
    await this.users.save(user);

    await this.streaks.save([
      this.streaks.create({ id: generateId(), userId, type: 'no_overspend' }),
      this.streaks.create({ id: generateId(), userId, type: 'expense_logging' }),
    ]);

    const created = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'currency', 'image', 'isOnboarded', 'createdAt'],
    });
    return created!;
  }

  async findByEmail(email: string) {
    return this.users.findOne({
      where: { email: email.toLowerCase() },
      select: ['id', 'name', 'email', 'password', 'currency', 'image', 'isOnboarded', 'createdAt'],
    });
  }

  async findById(id: string) {
    return this.users.findOne({
      where: { id },
      select: ['id', 'name', 'email', 'currency', 'image', 'isOnboarded', 'createdAt'],
    });
  }

  async updatePassword(userId: string, hashedPassword: string) {
    await this.users.update({ id: userId }, { password: hashedPassword });
  }

  async completeOnboarding(userId: string, dto: OnboardDto) {
    await this.users.update({ id: userId }, {
      currency: dto.currency ?? 'INR',
      isOnboarded: true,
    });

    if (dto.monthlyIncome && dto.monthlyIncome > 0) {
      await this.incomes.save(
        this.incomes.create({
          id: generateId(),
          userId,
          source: 'Primary Income',
          type: IncomeType.SALARY,
          amount: dto.monthlyIncome.toString(),
          frequency: IncomeFrequency.MONTHLY,
          date: new Date(),
          isActive: true,
        }),
      );
    }

    if (dto.debts && dto.debts.length > 0) {
      await this.debts.save(
        dto.debts.map((d) =>
          this.debts.create({
            id: generateId(),
            userId,
            name: d.name,
            type: d.type,
            balance: d.balance.toString(),
            originalAmount: (d.originalAmount ?? d.balance).toString(),
            apr: d.apr.toString(),
            minimumPayment: d.minimumPayment.toString(),
            termMonths: d.termMonths ?? null,
            dueDate: d.dueDate,
            lender: d.lender ?? null,
            startDate: new Date(),
            isPaidOff: false,
          }),
        ),
      );
    }

    const updated = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'name', 'email', 'currency', 'image', 'isOnboarded'],
    });
    return updated!;
  }
}
