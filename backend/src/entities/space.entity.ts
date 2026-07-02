import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { SpaceMember } from './space-member.entity';

@Entity('Space')
@Index(['ownerId'])
export class Space {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column({ default: 'CUSTOM' })
  type: string; // PERSONAL | FRIENDS | FAMILY | CUSTOM

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column()
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @OneToMany(() => SpaceMember, (m) => m.space, { cascade: true })
  members: SpaceMember[];

  @CreateDateColumn()
  createdAt: Date;
}
