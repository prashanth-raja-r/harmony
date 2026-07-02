import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { User } from './user.entity';

@Entity('Streak')
@Unique(['userId', 'type'])
@Index(['userId'])
export class Streak {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column({ default: 0 })
  currentStreak: number;

  @Column({ default: 0 })
  longestStreak: number;

  @CreateDateColumn()
  lastActivityAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.streaks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
