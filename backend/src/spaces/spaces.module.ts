import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { Space } from '../entities/space.entity';
import { SpaceMember } from '../entities/space-member.entity';
import { User } from '../entities/user.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { HarmonyScore } from '../entities/harmony-score.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Space, SpaceMember, User, Income, Transaction, Debt, Goal, HarmonyScore]),
    MailModule,
  ],
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
