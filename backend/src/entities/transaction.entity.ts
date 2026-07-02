import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';

@Entity('Transaction')
@Index(['userId'])
@Index(['userId', 'date'])
export class Transaction {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  categoryId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @Column()
  description: string;

  @Column()
  date: Date;

  @Column({ type: 'varchar', nullable: true })
  paymentMethod: string | null;

  @Column({ default: false })
  isRecurring: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Category, (c) => c.transactions, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category | null;
}
