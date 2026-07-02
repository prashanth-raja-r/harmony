import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  User, Debt, DebtPayment, Category, Transaction,
  Income, Budget, Goal, GoalMilestone,
  AIConversation, AIMessage, Notification, HarmonyScore, Streak,
  Space, SpaceMember, PasswordResetToken, Otp,
} from '../entities';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [
          User, Debt, DebtPayment, Category, Transaction,
          Income, Budget, Goal, GoalMilestone,
          AIConversation, AIMessage, Notification, HarmonyScore, Streak,
          Space, SpaceMember, PasswordResetToken, Otp,
        ],
        synchronize: true,
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
  ],
})
export class DatabaseModule {}
