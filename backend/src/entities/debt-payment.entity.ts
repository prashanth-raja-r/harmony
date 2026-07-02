import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Debt } from './debt.entity';

@Entity('DebtPayment')
@Index(['debtId'])
export class DebtPayment {
  @PrimaryColumn()
  id: string;

  @Column()
  debtId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  principalAmount: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  interestAmount: string;

  @Column()
  paymentDate: Date;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Debt, (d) => d.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'debtId' })
  debt: Debt;
}
