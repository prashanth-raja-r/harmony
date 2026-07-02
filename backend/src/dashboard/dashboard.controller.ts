import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QuickAddDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  date?: string;
}

type AuthRequest = Express.Request & { user: { id: string } };

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(@Request() req: AuthRequest) {
    return this.dashboardService.getSummary(req.user.id);
  }

  @Post('transactions/quick-add')
  quickAdd(@Request() req: AuthRequest, @Body() dto: QuickAddDto) {
    return this.dashboardService.quickAddTransaction(req.user.id, dto);
  }

  @Get('categories')
  categories(@Request() req: AuthRequest) {
    return this.dashboardService.getCategories(req.user.id);
  }
}
