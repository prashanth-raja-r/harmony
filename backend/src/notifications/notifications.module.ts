import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notification } from '../entities/notification.entity';
import { Transaction } from '../entities/transaction.entity';
import { Budget } from '../entities/budget.entity';
import { Debt } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Goal } from '../entities/goal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Transaction, Budget, Debt, DebtPayment, Goal])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
