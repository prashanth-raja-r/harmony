import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('Otp')
@Index(['email', 'type'])
export class Otp {
  @PrimaryColumn()
  id: string;

  @Column()
  email: string;

  @Column()
  code: string;

  @Column()
  type: string; // 'SIGNUP' | 'LOGIN'

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
