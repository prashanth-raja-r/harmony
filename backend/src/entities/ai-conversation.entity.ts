import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { User } from './user.entity';
import { AIMessage } from './ai-message.entity';

@Entity('AIConversation')
@Index(['userId'])
export class AIConversation {
  @PrimaryColumn()
  id: string;

  @Column()
  userId: string;

  @Column({ default: 'New Conversation' })
  title: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => AIMessage, (m) => m.conversation)
  messages: AIMessage[];
}
