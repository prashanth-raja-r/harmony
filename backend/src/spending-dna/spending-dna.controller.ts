import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpendingDnaService } from './spending-dna.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('spending-dna')
@UseGuards(JwtAuthGuard)
export class SpendingDnaController {
  constructor(private readonly svc: SpendingDnaService) {}

  @Get()
  analyze(@Req() req: Request) {
    return this.svc.analyze(uid(req));
  }
}
