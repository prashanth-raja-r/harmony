import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachController } from './coach.controller';
import { CoachService } from './coach.service';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
import { Debt } from '../entities/debt.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Income, Transaction, Budget, Debt, User])],
  controllers: [CoachController],
  providers: [CoachService],
})
export class CoachModule {}
