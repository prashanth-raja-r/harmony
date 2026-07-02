import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Transaction } from '../entities/transaction.entity';
import { Income } from '../entities/income.entity';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { HarmonyScore } from '../entities/harmony-score.entity';
import { Streak } from '../entities/streak.entity';
import { Category } from '../entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Income, Debt, Goal, HarmonyScore, Streak, Category])],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
