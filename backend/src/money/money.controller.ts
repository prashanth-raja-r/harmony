import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MoneyService, CreateIncomeDto, CreateTransactionDto, CreateBudgetDto } from './money.service';
import {
  IsString, IsNumber, IsOptional, IsBoolean, IsDateString,
  Min, Max, IsInt, MinLength, MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

class CreateTransactionBody implements CreateTransactionDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsString() @MinLength(1) @MaxLength(200) description!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === 'true' || value === true) isRecurring?: boolean;
}

class CreateIncomeBody implements CreateIncomeDto {
  @IsString() @MinLength(1) @MaxLength(100) source!: string;
  @IsString() type!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsString() frequency!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateBudgetBody implements CreateBudgetDto {
  @IsString() categoryId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year!: number;
}

type AuthReq = Express.Request & { user: { id: string } };

@UseGuards(JwtAuthGuard)
@Controller('money')
export class MoneyController {
  constructor(private readonly moneyService: MoneyService) {}

  /* ─── Summary ─── */
  @Get('summary')
  summary(
    @Request() req: AuthReq,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const now = new Date();
    return this.moneyService.getMonthlySummary(
      req.user.id,
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
    );
  }

  /* ─── Spending Trends ─── */
  @Get('trends')
  trends(@Request() req: AuthReq, @Query('months') months?: string) {
    return this.moneyService.getTrends(req.user.id, months ? parseInt(months) : 6);
  }

  /* ─── Categories ─── */
  @Get('categories')
  categories(@Request() req: AuthReq) {
    return this.moneyService.getCategories(req.user.id);
  }

  /* ─── Transactions ─── */
  @Get('transactions')
  transactions(
    @Request() req: AuthReq,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
  ) {
    return this.moneyService.getTransactions(req.user.id, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      categoryId,
      page: page ? parseInt(page) : 1,
    });
  }

  @Post('transactions')
  createTransaction(@Request() req: AuthReq, @Body() dto: CreateTransactionBody) {
    return this.moneyService.createTransaction(req.user.id, dto);
  }

  @Patch('transactions/:id')
  updateTransaction(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTransactionBody>,
  ) {
    return this.moneyService.updateTransaction(req.user.id, id, dto);
  }

  @Delete('transactions/:id')
  deleteTransaction(@Request() req: AuthReq, @Param('id') id: string) {
    return this.moneyService.deleteTransaction(req.user.id, id);
  }

  /* ─── Income ─── */
  @Get('income')
  getIncomes(@Request() req: AuthReq) {
    return this.moneyService.getIncomes(req.user.id);
  }

  @Post('income')
  createIncome(@Request() req: AuthReq, @Body() dto: CreateIncomeBody) {
    return this.moneyService.createIncome(req.user.id, dto);
  }

  @Patch('income/:id')
  updateIncome(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: Partial<CreateIncomeBody>,
  ) {
    return this.moneyService.updateIncome(req.user.id, id, dto);
  }

  @Delete('income/:id')
  deleteIncome(@Request() req: AuthReq, @Param('id') id: string) {
    return this.moneyService.deleteIncome(req.user.id, id);
  }

  /* ─── Budgets ─── */
  @Get('budgets')
  getBudgets(
    @Request() req: AuthReq,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const now = new Date();
    return this.moneyService.getBudgets(
      req.user.id,
      month ? parseInt(month) : now.getMonth() + 1,
      year ? parseInt(year) : now.getFullYear(),
    );
  }

  @Post('budgets')
  upsertBudget(@Request() req: AuthReq, @Body() dto: CreateBudgetBody) {
    return this.moneyService.upsertBudget(req.user.id, dto);
  }

  @Delete('budgets/:id')
  deleteBudget(@Request() req: AuthReq, @Param('id') id: string) {
    return this.moneyService.deleteBudget(req.user.id, id);
  }
}
