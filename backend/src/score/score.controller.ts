import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScoreService } from './score.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('score')
@UseGuards(JwtAuthGuard)
export class ScoreController {
  constructor(private readonly scoreService: ScoreService) {}

  /** Live computed score + latest stored score */
  @Get()
  getLatest(@Req() req: Request) {
    return this.scoreService.getLatest(uid(req));
  }

  /** Persist a snapshot of the current score */
  @Post('snapshot')
  snapshot(@Req() req: Request) {
    return this.scoreService.calculateAndSave(uid(req));
  }

  /** Score history (for chart) */
  @Get('history')
  history(@Req() req: Request, @Query('limit') limit?: string) {
    return this.scoreService.getHistory(uid(req), limit ? Number(limit) : 12);
  }
}
