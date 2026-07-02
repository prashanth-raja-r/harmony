import { Controller, Get, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TodayService } from './today.service';

@Controller('today')
@UseGuards(JwtAuthGuard)
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  @Get()
  async getToday(@Req() req: { user: { id: string } }) {
    return this.todayService.getToday(req.user.id);
  }

  @Patch(':id/complete')
  async completeAction(
    @Req() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.todayService.completeAction(req.user.id, id);
  }
}
