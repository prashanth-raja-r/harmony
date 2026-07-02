import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';

@Entity('Budget')
@Unique(['userId', 'categoryId', 'month', 'year'])
@Index(['userId', 'year', 'month'])
export class Budget {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  categoryId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @Column()
  month: number;

  @Column()
  year: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.budgets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Category, (c) => c.budgets)
  @JoinColumn({ name: 'categoryId' })
  category: Category;
}
