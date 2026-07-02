import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TodayController } from './today.controller';
import { TodayService } from './today.service';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Streak } from '../entities/streak.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Debt, DebtPayment, Income, Transaction, Streak])],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
