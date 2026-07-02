import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Space } from '../entities/space.entity';
import { SpaceMember } from '../entities/space-member.entity';
import { User } from '../entities/user.entity';
import { Income } from '../entities/income.entity';
import { Transaction } from '../entities/transaction.entity';
import { Debt } from '../entities/debt.entity';
import { Goal } from '../entities/goal.entity';
import { HarmonyScore } from '../entities/harmony-score.entity';
import { MailService } from '../mail/mail.service';
import { generateId, calcMonthlyIncome } from '../common/db.helpers';

export interface CreateSpaceDto {
  name: string;
  type: string;
  description?: string;
}

export interface InviteMemberDto {
  email: string;
}

export interface UpdateMemberDto {
  role: string;
}

const VALID_TYPES = ['PERSONAL', 'FRIENDS', 'FAMILY', 'CUSTOM'];

@Injectable()
export class SpacesService {
  constructor(
    @InjectRepository(Space) private spaces: Repository<Space>,
    @InjectRepository(SpaceMember) private members: Repository<SpaceMember>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Income) private incomes: Repository<Income>,
    @InjectRepository(Transaction) private transactions: Repository<Transaction>,
    @InjectRepository(Debt) private debts: Repository<Debt>,
    @InjectRepository(Goal) private goals: Repository<Goal>,
    @InjectRepository(HarmonyScore) private harmonyScores: Repository<HarmonyScore>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async listSpaces(userId: string) {
    const memberships = await this.members.find({
      where: { userId },
      relations: ['space', 'space.members', 'space.members.user', 'space.owner'],
    });
    return memberships.map((m) => this.serializeSpace(m.space, userId));
  }

  async getSpace(userId: string, spaceId: string) {
    const space = await this.loadSpace(spaceId);
    if (!space.members.find((m) => m.userId === userId)) {
      throw new ForbiddenException('Not a member of this space');
    }
    return this.serializeSpace(space, userId);
  }

  async createSpace(userId: string, dto: CreateSpaceDto) {
    const type = dto.type.toUpperCase();
    if (!VALID_TYPES.includes(type)) throw new BadRequestException('Invalid space type');

    const space = this.spaces.create({
      id: generateId(),
      name: dto.name.trim(),
      type,
      description: dto.description?.trim() ?? null,
      ownerId: userId,
    });
    await this.spaces.save(space);

    const ownerMember = this.members.create({
      id: generateId(),
      spaceId: space.id,
      userId,
      role: 'ADMIN',
      status: 'ACCEPTED',
      joinedAt: new Date(),
    });
    await this.members.save(ownerMember);

    return this.serializeSpace(await this.loadSpace(space.id), userId);
  }

  async updateSpace(userId: string, spaceId: string, dto: Partial<{ name: string; description: string }>) {
    const space = await this.requireAdmin(userId, spaceId);
    if (dto.name) space.name = dto.name.trim();
    if (dto.description !== undefined) space.description = dto.description?.trim() ?? null;
    await this.spaces.save(space);
    return this.serializeSpace(await this.loadSpace(spaceId), userId);
  }

  async deleteSpace(userId: string, spaceId: string) {
    const space = await this.spaces.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');
    if (space.ownerId !== userId) throw new ForbiddenException('Only the owner can delete this space');
    await this.spaces.delete(spaceId);
    return { success: true };
  }

  async inviteMember(userId: string, spaceId: string, dto: InviteMemberDto) {
    const space = await this.spaces.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');
    await this.requireAdmin(userId, spaceId);

    if (space.type === 'PERSONAL') {
      throw new BadRequestException('Personal spaces cannot have additional members');
    }

    const email = dto.email.toLowerCase().trim();
    const invitee = await this.users.findOne({ where: { email } });
    const inviter = await this.users.findOne({ where: { id: userId }, select: ['name'] });
    const inviterName = inviter?.name ?? 'Someone';
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    if (invitee) {
      if (invitee.id === userId) throw new BadRequestException('You cannot invite yourself');
      const existing = await this.members.findOne({ where: { spaceId, userId: invitee.id } });
      if (existing) throw new BadRequestException('User already has a membership or pending invite');

      await this.members.save(
        this.members.create({
          id: generateId(), spaceId, userId: invitee.id, inviteEmail: null,
          role: 'MEMBER', status: 'PENDING', joinedAt: null,
        }),
      );
      void this.mail.sendSpaceInvite(email, space.name, inviterName, frontendUrl, true);
    } else {
      // Person not yet on Harmony — store email invite, auto-link when they sign up
      const existing = await this.members.findOne({ where: { spaceId, inviteEmail: email } });
      if (existing) throw new BadRequestException('An invite has already been sent to this email');

      await this.members.save(
        this.members.create({
          id: generateId(), spaceId, userId: null, inviteEmail: email,
          role: 'MEMBER', status: 'PENDING', joinedAt: null,
        }),
      );
      void this.mail.sendSpaceInvite(email, space.name, inviterName, frontendUrl, false);
    }

    return this.serializeSpace(await this.loadSpace(spaceId), userId);
  }

  async getSpaceDashboard(userId: string, spaceId: string) {
    const membership = await this.members.findOne({ where: { spaceId, userId, status: 'ACCEPTED' } });
    if (!membership) throw new ForbiddenException('Not a member of this space');

    const accepted = await this.members.find({
      where: { spaceId, status: 'ACCEPTED' },
      relations: ['user'],
    });

    const validMembers = accepted.filter((m) => m.userId && m.user);
    if (validMembers.length === 0) {
      return { members: [], totals: { memberCount: 0, combinedMonthlyIncome: 0, combinedTotalDebt: 0, combinedMonthlySpend: 0, combinedMonthlySavings: 0, combinedNetWorth: 0, avgHarmonyScore: null }, month: new Date().getMonth() + 1, year: new Date().getFullYear() };
    }

    const memberIds = validMembers.map((m) => m.userId!);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Batch all 5 queries in parallel — no N+1
    const [allIncomes, allDebts, allTxs, allGoals, allScores] = await Promise.all([
      this.incomes.find({ where: { userId: In(memberIds), isActive: true } }),
      this.debts.find({ where: { userId: In(memberIds), isPaidOff: false } }),
      this.transactions.find({ where: { userId: In(memberIds), date: Between(startOfMonth, endOfMonth) } }),
      this.goals.find({ where: { userId: In(memberIds), isCompleted: false } }),
      this.harmonyScores.find({ where: { userId: In(memberIds) }, order: { createdAt: 'DESC' } }),
    ]);

    function groupBy<T extends { userId: string }>(arr: T[]): Map<string, T[]> {
      return arr.reduce((map, item) => {
        const list = map.get(item.userId) ?? [];
        list.push(item);
        map.set(item.userId, list);
        return map;
      }, new Map<string, T[]>());
    }

    const incomeByUser = groupBy(allIncomes);
    const debtByUser   = groupBy(allDebts);
    const txByUser     = groupBy(allTxs);
    const goalByUser   = groupBy(allGoals);
    // Latest score per user (results ordered DESC — first hit per userId wins)
    const scoreByUser = allScores.reduce((map, s) => {
      if (!map.has(s.userId)) map.set(s.userId, s);
      return map;
    }, new Map<string, HarmonyScore>());

    const memberStats = validMembers.map((m) => {
      const uid = m.userId!;

      const incomeRows = incomeByUser.get(uid) ?? [];
      const monthlyIncome = calcMonthlyIncome(incomeRows);

      const debtRows = debtByUser.get(uid) ?? [];
      const totalDebt = debtRows.reduce((s, d) => s + Number(d.balance), 0);
      const monthlyDebtPayment = debtRows.reduce((s, d) => s + Number(d.minimumPayment), 0);

      const monthlySpend = (txByUser.get(uid) ?? []).reduce((s, t) => s + Number(t.amount), 0);

      const goalRows = goalByUser.get(uid) ?? [];
      const goalTarget  = goalRows.reduce((s, g) => s + Number(g.targetAmount), 0);
      const goalCurrent = goalRows.reduce((s, g) => s + Number(g.currentAmount), 0);

      const hs = scoreByUser.get(uid);

      return {
        memberId: m.id,
        userId: uid,
        name: m.user!.name,
        email: m.user!.email,
        role: m.role,
        isCurrentUser: uid === userId,
        monthlyIncome: Math.round(monthlyIncome),
        totalDebt: Math.round(totalDebt),
        monthlyDebtPayment: Math.round(monthlyDebtPayment),
        monthlySpend: Math.round(monthlySpend),
        monthlySavings: Math.round(monthlyIncome - monthlySpend - monthlyDebtPayment),
        goals: {
          count: goalRows.length,
          totalTarget: Math.round(goalTarget),
          totalCurrent: Math.round(goalCurrent),
          progress: goalTarget > 0 ? Math.round((goalCurrent / goalTarget) * 100) : 0,
        },
        harmonyScore: hs?.score ?? null,
        netWorth: Math.round(goalCurrent - totalDebt),
      };
    });

    const scoredMembers = memberStats.filter((m) => m.harmonyScore !== null);
    const totals = {
      memberCount: memberStats.length,
      combinedMonthlyIncome:  memberStats.reduce((s, m) => s + m.monthlyIncome, 0),
      combinedTotalDebt:      memberStats.reduce((s, m) => s + m.totalDebt, 0),
      combinedMonthlySpend:   memberStats.reduce((s, m) => s + m.monthlySpend, 0),
      combinedMonthlySavings: memberStats.reduce((s, m) => s + m.monthlySavings, 0),
      combinedNetWorth:       memberStats.reduce((s, m) => s + m.netWorth, 0),
      avgHarmonyScore: scoredMembers.length
        ? Math.round(scoredMembers.reduce((s, m) => s + (m.harmonyScore ?? 0), 0) / scoredMembers.length)
        : null,
    };

    return { members: memberStats, totals, month: now.getMonth() + 1, year: now.getFullYear() };
  }

  async getPendingInvites(userId: string) {
    const pending = await this.members.find({
      where: { userId, status: 'PENDING' },
      relations: ['space', 'space.owner'],
    });
    return pending.map((m) => ({
      id: m.id,
      spaceId: m.spaceId,
      spaceName: m.space.name,
      spaceType: m.space.type,
      invitedBy: m.space.owner
        ? { id: m.space.owner.id, name: m.space.owner.name, email: m.space.owner.email }
        : { id: '', name: null, email: '' },
      invitedAt: m.invitedAt.toISOString(),
    }));
  }

  async acceptInvite(userId: string, memberId: string) {
    const member = await this.members.findOne({ where: { id: memberId, userId, status: 'PENDING' } });
    if (!member) throw new NotFoundException('Invite not found');
    member.status = 'ACCEPTED';
    member.joinedAt = new Date();
    await this.members.save(member);
    return this.serializeSpace(await this.loadSpace(member.spaceId), userId);
  }

  async declineInvite(userId: string, memberId: string) {
    const member = await this.members.findOne({ where: { id: memberId, userId, status: 'PENDING' } });
    if (!member) throw new NotFoundException('Invite not found');
    await this.members.delete(memberId);
    return { success: true };
  }

  async updateMemberRole(userId: string, spaceId: string, targetUserId: string, dto: UpdateMemberDto) {
    const space = await this.spaces.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');
    await this.requireAdmin(userId, spaceId);

    if (space.ownerId === targetUserId) throw new ForbiddenException("Cannot change the owner's role");

    const member = await this.members.findOne({ where: { spaceId, userId: targetUserId } });
    if (!member) throw new NotFoundException('Member not found');

    const role = dto.role.toUpperCase();
    if (!['ADMIN', 'MEMBER'].includes(role)) throw new BadRequestException('Invalid role');

    member.role = role;
    await this.members.save(member);
    return this.serializeSpace(await this.loadSpace(spaceId), userId);
  }

  async cancelInvite(adminId: string, spaceId: string, memberId: string) {
    await this.requireAdmin(adminId, spaceId);
    const member = await this.members.findOne({ where: { id: memberId, spaceId, status: 'PENDING' } });
    if (!member) throw new NotFoundException('Pending invite not found');
    await this.members.delete(memberId);
    return this.serializeSpace(await this.loadSpace(spaceId), adminId);
  }

  async removeMember(userId: string, spaceId: string, targetUserId: string) {
    const space = await this.spaces.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');

    const myMembership = await this.members.findOne({ where: { spaceId, userId } });
    if (!myMembership) throw new ForbiddenException('Not a member of this space');

    const isSelf = userId === targetUserId;
    if (!isSelf && myMembership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can remove other members');
    }
    if (targetUserId === space.ownerId) throw new ForbiddenException('Cannot remove the space owner');

    const target = await this.members.findOne({ where: { spaceId, userId: targetUserId } });
    if (!target) throw new NotFoundException('Member not found');

    await this.members.delete(target.id);
    return isSelf ? { left: true } : this.serializeSpace(await this.loadSpace(spaceId), userId);
  }

  private async loadSpace(spaceId: string): Promise<Space & { members: SpaceMember[]; owner: User }> {
    const space = await this.spaces.findOne({
      where: { id: spaceId },
      relations: ['members', 'members.user', 'owner'],
    });
    if (!space) throw new NotFoundException('Space not found');
    return space as Space & { members: SpaceMember[]; owner: User };
  }

  private async requireAdmin(userId: string, spaceId: string): Promise<Space> {
    const space = await this.spaces.findOne({ where: { id: spaceId } });
    if (!space) throw new NotFoundException('Space not found');
    const membership = await this.members.findOne({ where: { spaceId, userId, status: 'ACCEPTED' } });
    if (!membership || membership.role !== 'ADMIN') throw new ForbiddenException('Admin access required');
    return space;
  }

  private serializeSpace(
    space: Space & { members?: SpaceMember[]; owner?: User },
    currentUserId: string,
  ) {
    const myMembership = space.members?.find((m) => m.userId === currentUserId);
    return {
      id: space.id,
      name: space.name,
      type: space.type,
      description: space.description,
      ownerId: space.ownerId,
      owner: space.owner
        ? { id: space.owner.id, name: space.owner.name, email: space.owner.email }
        : null,
      myRole: myMembership?.role ?? null,
      myStatus: myMembership?.status ?? null,
      memberCount: space.members?.filter((m) => m.status === 'ACCEPTED').length ?? 0,
      members: (space.members ?? []).map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user?.name ?? null,
        email: m.user?.email ?? m.inviteEmail ?? null,
        isPendingSignup: !m.userId && !!m.inviteEmail,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt?.toISOString() ?? null,
        invitedAt: m.invitedAt?.toISOString() ?? null,
      })),
      createdAt: space.createdAt.toISOString(),
    };
  }
}
