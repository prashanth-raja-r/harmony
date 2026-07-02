import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { GoalMilestone } from './goal-milestone.entity';

export enum GoalType {
  DEBT_FREE       = 'DEBT_FREE',
  EMERGENCY_FUND  = 'EMERGENCY_FUND',
  SAVINGS_TARGET  = 'SAVINGS_TARGET',
  PURCHASE        = 'PURCHASE',
  CUSTOM          = 'CUSTOM',
}

@Entity('Goal')
@Index(['userId'])
export class Goal {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  targetAmount: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  currentAmount: string;

  @Column({ type: 'timestamp', nullable: true })
  targetDate: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  monthlyContribution: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.goals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => GoalMilestone, (m) => m.goal)
  milestones: GoalMilestone[];
}
