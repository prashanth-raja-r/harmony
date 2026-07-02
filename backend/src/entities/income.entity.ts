import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';

export enum IncomeFrequency {
  MONTHLY   = 'MONTHLY',
  WEEKLY    = 'WEEKLY',
  BIWEEKLY  = 'BIWEEKLY',
  ONE_TIME  = 'ONE_TIME',
}

export enum IncomeType {
  SALARY      = 'SALARY',
  FREELANCE   = 'FREELANCE',
  BUSINESS    = 'BUSINESS',
  INVESTMENTS = 'INVESTMENTS',
  OTHER       = 'OTHER',
}

@Entity('Income')
@Index(['userId'])
export class Income {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  source: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @Column({ type: 'varchar' })
  frequency: string;

  @Column()
  date: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.incomes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
