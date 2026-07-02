import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoneyService } from './money.service';
import { MoneyController } from './money.controller';
import { Transaction } from '../entities/transaction.entity';
import { Income } from '../entities/income.entity';
import { Budget } from '../entities/budget.entity';
import { Category } from '../entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Income, Budget, Category])],
  providers: [MoneyService],
  controllers: [MoneyController],
})
export class MoneyModule {}
