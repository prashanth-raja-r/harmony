import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DebtsModule } from './debts/debts.module';
import { MoneyModule } from './money/money.module';
import { CoachModule } from './coach/coach.module';
import { ScoreModule } from './score/score.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { SpendingDnaModule } from './spending-dna/spending-dna.module';
import { TodayModule } from './today/today.module';
import { GoalsModule } from './goals/goals.module';
import { NetWorthModule } from './net-worth/net-worth.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SpacesModule } from './spaces/spaces.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api*'],
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    DashboardModule,
    DebtsModule,
    MoneyModule,
    CoachModule,
    ScoreModule,
    NotificationsModule,
    SettingsModule,
    ScenariosModule,
    SpendingDnaModule,
    TodayModule,
    GoalsModule,
    NetWorthModule,
    SubscriptionsModule,
    SpacesModule,
    MailModule,
  ],
})
export class AppModule {}
