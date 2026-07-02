import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../entities/user.entity';
import { Streak } from '../entities/streak.entity';
import { Income } from '../entities/income.entity';
import { Debt } from '../entities/debt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Streak, Income, Debt])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
