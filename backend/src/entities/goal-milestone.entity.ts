import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Goal } from './goal.entity';

@Entity('GoalMilestone')
@Index(['goalId'])
export class GoalMilestone {
  @PrimaryColumn()
  id: string;

  @Column()
  goalId: string;

  @Column()
  title: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @Column({ default: false })
  isReached: boolean;

  @Column({ type: 'timestamp', nullable: true })
  reachedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Goal, (g) => g.milestones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goalId' })
  goal: Goal;
}
