import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { Goal } from '../entities/goal.entity';
import { GoalMilestone } from '../entities/goal-milestone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, GoalMilestone])],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
