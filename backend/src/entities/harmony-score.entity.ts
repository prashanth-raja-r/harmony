import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('HarmonyScore')
@Index(['userId'])
@Index(['userId', 'date'])
export class HarmonyScore {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  score: number;

  @Column()
  debtRatioScore: number;

  @Column()
  savingsScore: number;

  @Column()
  paymentScore: number;

  @Column()
  budgetScore: number;

  @Column()
  emergencyScore: number;

  @CreateDateColumn()
  date: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.harmonyScores, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
