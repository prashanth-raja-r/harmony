import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScenariosService, ScenarioInput } from './scenarios.service';
import { Request } from 'express';

@Controller('scenarios')
@UseGuards(JwtAuthGuard)
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}

  @Post('simulate')
  simulate(@Req() req: Request, @Body() body: ScenarioInput) {
    return this.service.simulate((req.user as { id: string }).id, body);
  }
}
