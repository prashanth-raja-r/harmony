import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpendingDnaController } from './spending-dna.controller';
import { SpendingDnaService } from './spending-dna.service';
import { Transaction } from '../entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction])],
  controllers: [SpendingDnaController],
  providers: [SpendingDnaService],
})
export class SpendingDnaModule {}
