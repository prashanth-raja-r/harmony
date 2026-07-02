import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DebtsService, CreateDebtDto, UpdateDebtDto, AddPaymentDto } from './debts.service';
import {
  IsString, IsNumber, IsOptional, IsDateString, Min, Max, IsInt, MinLength, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateDebtBody implements CreateDebtDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() type!: string;
  @Type(() => Number) @IsNumber() @Min(0) balance!: number;
  @Type(() => Number) @IsNumber() @Min(0) originalAmount!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(200) apr!: number;
  @Type(() => Number) @IsNumber() @Min(0) minimumPayment!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) termMonths?: number;
  @IsInt() @Min(1) @Max(31) dueDate!: number;
  @IsOptional() @IsString() lender?: string;
  @IsDateString() startDate!: string;
}

class UpdateDebtBody implements UpdateDebtDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) balance?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(200) apr?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPayment?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) termMonths?: number;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDate?: number;
  @IsOptional() @IsString() lender?: string;
}

class AddPaymentBody implements AddPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() note?: string;
}

type AuthReq = Express.Request & { user: { id: string } };

@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    return this.debtsService.findAll(req.user.id);
  }

  @Get('strategies')
  strategies(@Request() req: AuthReq) {
    return this.debtsService.getPayoffStrategies(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: AuthReq, @Param('id') id: string) {
    return this.debtsService.findOne(req.user.id, id);
  }

  @Post()
  create(@Request() req: AuthReq, @Body() dto: CreateDebtBody) {
    return this.debtsService.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Request() req: AuthReq, @Param('id') id: string, @Body() dto: UpdateDebtBody) {
    return this.debtsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: AuthReq, @Param('id') id: string) {
    return this.debtsService.remove(req.user.id, id);
  }

  @Patch(':id/paid-off')
  markPaidOff(@Request() req: AuthReq, @Param('id') id: string) {
    return this.debtsService.markPaidOff(req.user.id, id);
  }

  @Patch(':id/undo-paid-off')
  undoPaidOff(@Request() req: AuthReq, @Param('id') id: string) {
    return this.debtsService.undoPaidOff(req.user.id, id);
  }

  @Post(':id/payments')
  addPayment(@Request() req: AuthReq, @Param('id') id: string, @Body() dto: AddPaymentBody) {
    return this.debtsService.addPayment(req.user.id, id, dto);
  }

  @Post(':id/confirm-emi')
  confirmEmi(@Request() req: AuthReq, @Param('id') id: string) {
    return this.debtsService.confirmEmi(req.user.id, id);
  }
}
