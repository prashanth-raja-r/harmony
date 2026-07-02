import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetWorthController } from './net-worth.controller';
import { NetWorthService } from './net-worth.service';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Debt, Goal, Income, Transaction])],
  controllers: [NetWorthController],
  providers: [NetWorthService],
})
export class NetWorthModule {}
