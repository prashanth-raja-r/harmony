import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Space } from './space.entity';
import { User } from './user.entity';

@Entity('SpaceMember')
@Index(['spaceId'])
@Index(['userId'])
@Index(['inviteEmail'])
export class SpaceMember {
  @PrimaryColumn()
  id: string;

  @Column()
  spaceId: string;

  @ManyToOne(() => Space, (s) => s.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'spaceId' })
  space: Space;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  // Holds the email for invites where the invitee hasn't signed up yet
  @Column({ type: 'varchar', nullable: true })
  inviteEmail: string | null;

  @Column({ default: 'MEMBER' })
  role: string; // ADMIN | MEMBER

  @Column({ default: 'PENDING' })
  status: string; // PENDING | ACCEPTED

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @CreateDateColumn()
  invitedAt: Date;
}
