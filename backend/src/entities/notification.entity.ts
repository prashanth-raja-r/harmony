import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  BILL_DUE        = 'BILL_DUE',
  BUDGET_OVERSPEND = 'BUDGET_OVERSPEND',
  DEBT_PAYMENT    = 'DEBT_PAYMENT',
  WEEKLY_SUMMARY  = 'WEEKLY_SUMMARY',
  GOAL_MILESTONE  = 'GOAL_MILESTONE',
  ANOMALY_ALERT   = 'ANOMALY_ALERT',
  GENERAL         = 'GENERAL',
}

@Entity('Notification')
@Index(['userId', 'isRead'])
export class Notification {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'varchar', nullable: true })
  link: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
