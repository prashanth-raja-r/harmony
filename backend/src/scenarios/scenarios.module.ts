import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { User } from '../entities/user.entity';
import { Income } from '../entities/income.entity';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { Transaction } from '../entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Income, Debt, Goal, Transaction])],
  controllers: [ScenariosController],
  providers: [ScenariosService],
})
export class ScenariosModule {}
