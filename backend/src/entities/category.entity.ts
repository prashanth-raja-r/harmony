import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, Index,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { Budget } from './budget.entity';

@Entity('Category')
@Index(['userId'])
export class Category {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column()
  name: string;

  @Column()
  icon: string;

  @Column()
  color: string;

  @Column({ default: false })
  isSystem: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Transaction, (t) => t.category)
  transactions: Transaction[];

  @OneToMany(() => Budget, (b) => b.category)
  budgets: Budget[];
}
