import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { AIConversation } from './ai-conversation.entity';

export enum MessageRole {
  USER      = 'USER',
  ASSISTANT = 'ASSISTANT',
}

@Entity('AIMessage')
@Index(['conversationId'])
export class AIMessage {
  @PrimaryColumn()
  id: string;

  @Column()
  conversationId: string;

  @Column({ type: 'varchar' })
  role: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => AIConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: AIConversation;
}
