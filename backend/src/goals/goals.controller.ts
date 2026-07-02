import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoalsService, CreateGoalDto, UpdateGoalDto, CreateMilestoneDto } from './goals.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.goalsService.getGoals(uid(req));
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.goalsService.getGoal(uid(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateGoalDto) {
    return this.goalsService.createGoal(uid(req), dto);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goalsService.updateGoal(uid(req), id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.goalsService.deleteGoal(uid(req), id);
  }

  @Post(':id/milestones')
  addMilestone(@Req() req: Request, @Param('id') goalId: string, @Body() dto: CreateMilestoneDto) {
    return this.goalsService.addMilestone(uid(req), goalId, dto);
  }

  @Delete(':id/milestones/:milestoneId')
  deleteMilestone(@Req() req: Request, @Param('id') goalId: string, @Param('milestoneId') milestoneId: string) {
    return this.goalsService.deleteMilestone(uid(req), goalId, milestoneId);
  }
}
