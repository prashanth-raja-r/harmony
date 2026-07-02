import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NetWorthService } from './net-worth.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('net-worth')
@UseGuards(JwtAuthGuard)
export class NetWorthController {
  constructor(private readonly svc: NetWorthService) {}

  @Get()
  get(@Req() req: Request) {
    return this.svc.getNetWorth(uid(req));
  }
}
