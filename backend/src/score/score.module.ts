import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScoreController } from './score.controller';
import { ScoreService } from './score.service';
import { HarmonyScore } from '../entities/harmony-score.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Debt } from '../entities/debt.entity';
import { Budget } from '../entities/budget.entity';
import { Goal } from '../entities/goal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HarmonyScore, Income, Transaction, Debt, Budget, Goal])],
  controllers: [ScoreController],
  providers: [ScoreService],
  exports: [ScoreService],
})
export class ScoreModule {}
