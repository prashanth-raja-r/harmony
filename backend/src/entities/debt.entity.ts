import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { DebtPayment } from './debt-payment.entity';

export enum DebtType {
  CREDIT_CARD        = 'CREDIT_CARD',
  CREDIT_CARD_LOAN   = 'CREDIT_CARD_LOAN',
  PERSONAL_LOAN      = 'PERSONAL_LOAN',
  HOME_LOAN          = 'HOME_LOAN',
  EDUCATION          = 'EDUCATION',
  VEHICLE            = 'VEHICLE',
  OVERDRAFT          = 'OVERDRAFT',
  JEWEL_LOAN         = 'JEWEL_LOAN',
  OTHER              = 'OTHER',
}

@Entity('Debt')
@Index(['userId'])
export class Debt {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balance: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  originalAmount: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  apr: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  minimumPayment: string;

  @Column({ type: 'int', nullable: true })
  termMonths: number | null;

  @Column()
  dueDate: number;

  @Column({ type: 'varchar', nullable: true })
  lender: string | null;

  @Column()
  startDate: Date;

  @Column({ default: false })
  isPaidOff: boolean;

  @Column({ type: 'timestamp', nullable: true })
  paidOffAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.debts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => DebtPayment, (p) => p.debt)
  payments: DebtPayment[];
}
