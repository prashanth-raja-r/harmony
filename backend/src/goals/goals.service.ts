import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThan } from 'typeorm';
import { Goal } from '../entities/goal.entity';
import { GoalMilestone } from '../entities/goal-milestone.entity';
import { generateId, toNum } from '../common/db.helpers';

export interface CreateGoalDto {
  name: string;
  type: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string;
  monthlyContribution?: number;
  description?: string;
}

export interface UpdateGoalDto {
  name?: string;
  type?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;
  monthlyContribution?: number;
  description?: string;
  isCompleted?: boolean;
}

export interface CreateMilestoneDto {
  title: string;
  amount: number;
}

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal)
    private readonly goals: Repository<Goal>,
    @InjectRepository(GoalMilestone)
    private readonly milestones: Repository<GoalMilestone>,
  ) {}

  async getGoals(userId: string) {
    const goals = await this.goals.find({
      where: { userId },
      relations: ['milestones'],
      order: { isCompleted: 'ASC', createdAt: 'DESC' },
    });
    goals.forEach((g) => g.milestones?.sort((a, b) => toNum(a.amount) - toNum(b.amount)));
    return goals.map((g) => this.serialize(g));
  }

  async getGoal(userId: string, id: string) {
    const g = await this.goals.findOne({ where: { id }, relations: ['milestones'] });
    if (!g) throw new NotFoundException('Goal not found.');
    if (g.userId !== userId) throw new ForbiddenException();
    g.milestones?.sort((a, b) => toNum(a.amount) - toNum(b.amount));
    return this.serialize(g);
  }

  async createGoal(userId: string, dto: CreateGoalDto) {
    const g = this.goals.create({
      id: generateId(),
      userId,
      name: dto.name,
      type: dto.type,
      targetAmount: String(dto.targetAmount),
      currentAmount: String(dto.currentAmount ?? 0),
      targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      monthlyContribution: dto.monthlyContribution != null ? String(dto.monthlyContribution) : null,
      description: dto.description ?? null,
    });
    await this.goals.save(g);
    const loaded = await this.goals.findOne({ where: { id: g.id }, relations: ['milestones'] });
    return this.serialize(loaded!);
  }

  async updateGoal(userId: string, id: string, dto: UpdateGoalDto) {
    await this.assertOwner(userId, id);

    const patch: Partial<Goal> = {};
    if (dto.name !== undefined)                patch.name = dto.name;
    if (dto.type !== undefined)                patch.type = dto.type;
    if (dto.targetAmount !== undefined)        patch.targetAmount = String(dto.targetAmount);
    if (dto.currentAmount !== undefined)       patch.currentAmount = String(dto.currentAmount);
    if (dto.targetDate !== undefined)          patch.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;
    if (dto.monthlyContribution !== undefined) patch.monthlyContribution = dto.monthlyContribution != null ? String(dto.monthlyContribution) : null;
    if (dto.description !== undefined)         patch.description = dto.description;
    if (dto.isCompleted !== undefined) {
      patch.isCompleted = dto.isCompleted;
      patch.completedAt = dto.isCompleted ? new Date() : null;
    }

    const current = await this.goals.findOne({ where: { id }, select: ['targetAmount', 'currentAmount'] });
    if (current) {
      const newCurrent = dto.currentAmount !== undefined ? dto.currentAmount : toNum(current.currentAmount);
      const newTarget = dto.targetAmount !== undefined ? dto.targetAmount : toNum(current.targetAmount);
      if (newCurrent >= newTarget && !patch.isCompleted) {
        patch.isCompleted = true;
        patch.completedAt = new Date();
      }
    }

    if (dto.currentAmount !== undefined) {
      await this.milestones.createQueryBuilder()
        .update()
        .set({ isReached: true, reachedAt: new Date() })
        .where('goalId = :id AND CAST(amount AS FLOAT) <= :amt AND isReached = false', { id, amt: dto.currentAmount })
        .execute();

      await this.milestones.createQueryBuilder()
        .update()
        .set({ isReached: false, reachedAt: () => 'NULL' })
        .where('goalId = :id AND CAST(amount AS FLOAT) > :amt AND isReached = true', { id, amt: dto.currentAmount })
        .execute();
    }

    await this.goals.update(id, patch);
    const loaded = await this.goals.findOne({ where: { id }, relations: ['milestones'] });
    loaded!.milestones?.sort((a, b) => toNum(a.amount) - toNum(b.amount));
    return this.serialize(loaded!);
  }

  async deleteGoal(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.goals.delete(id);
    return { deleted: true };
  }

  async addMilestone(userId: string, goalId: string, dto: CreateMilestoneDto) {
    await this.assertOwner(userId, goalId);
    const goal = await this.goals.findOne({ where: { id: goalId }, select: ['currentAmount'] });
    const m = this.milestones.create({
      id: generateId(),
      goalId,
      title: dto.title,
      amount: String(dto.amount),
      isReached: goal ? toNum(goal.currentAmount) >= dto.amount : false,
      reachedAt: goal && toNum(goal.currentAmount) >= dto.amount ? new Date() : null,
    });
    await this.milestones.save(m);
    return { ...m, amount: toNum(m.amount) };
  }

  async deleteMilestone(userId: string, goalId: string, milestoneId: string) {
    await this.assertOwner(userId, goalId);
    await this.milestones.delete(milestoneId);
    return { deleted: true };
  }

  private async assertOwner(userId: string, goalId: string) {
    const g = await this.goals.findOne({ where: { id: goalId }, select: ['userId'] });
    if (!g) throw new NotFoundException('Goal not found.');
    if (g.userId !== userId) throw new ForbiddenException();
  }

  private serialize(g: Goal & { milestones?: GoalMilestone[] }) {
    const target = toNum(g.targetAmount);
    const current = toNum(g.currentAmount);
    return {
      id: g.id,
      name: g.name,
      type: g.type,
      targetAmount: target,
      currentAmount: current,
      progress: target > 0 ? Math.min((current / target) * 100, 100) : 0,
      targetDate: g.targetDate?.toISOString() ?? null,
      monthlyContribution: g.monthlyContribution ? toNum(g.monthlyContribution) : null,
      description: g.description,
      isCompleted: g.isCompleted,
      completedAt: g.completedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      milestones: (g.milestones ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        amount: toNum(m.amount),
        isReached: m.isReached,
        reachedAt: m.reachedAt?.toISOString() ?? null,
      })),
    };
  }
}
