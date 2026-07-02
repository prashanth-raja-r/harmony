import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, Index,
} from 'typeorm';
import { Debt } from './debt.entity';
import { Transaction } from './transaction.entity';
import { Income } from './income.entity';
import { Budget } from './budget.entity';
import { Goal } from './goal.entity';
import { AIConversation } from './ai-conversation.entity';
import { Notification } from './notification.entity';
import { HarmonyScore } from './harmony-score.entity';
import { Streak } from './streak.entity';

@Entity('User')
export class User {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Index()
  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  password: string | null;

  @Column({ type: 'varchar', nullable: true })
  image: string | null;

  @Column({ default: 'INR' })
  currency: string;

  @Column({ default: false })
  privacyMode: boolean;

  @Column({ default: false })
  isOnboarded: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Debt, (d) => d.user)
  debts: Debt[];

  @OneToMany(() => Transaction, (t) => t.user)
  transactions: Transaction[];

  @OneToMany(() => Income, (i) => i.user)
  incomes: Income[];

  @OneToMany(() => Budget, (b) => b.user)
  budgets: Budget[];

  @OneToMany(() => Goal, (g) => g.user)
  goals: Goal[];

  @OneToMany(() => AIConversation, (c) => c.user)
  conversations: AIConversation[];

  @OneToMany(() => Notification, (n) => n.user)
  notifications: Notification[];

  @OneToMany(() => HarmonyScore, (s) => s.user)
  harmonyScores: HarmonyScore[];

  @OneToMany(() => Streak, (s) => s.user)
  streaks: Streak[];
}
