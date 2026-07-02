import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebtsService } from './debts.service';
import { DebtsController } from './debts.controller';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Debt, DebtPayment])],
  providers: [DebtsService],
  controllers: [DebtsController],
})
export class DebtsModule {}
