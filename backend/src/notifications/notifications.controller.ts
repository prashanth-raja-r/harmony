import { Controller, Get, Post, Patch, Delete, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  getAll(@Req() req: Request) {
    return this.service.getAll(uid(req));
  }

  @Get('unread-count')
  unreadCount(@Req() req: Request) {
    return this.service.getUnreadCount(uid(req));
  }

  @Post('generate')
  generate(@Req() req: Request) {
    return this.service.generateSmartNotifications(uid(req));
  }

  @Patch(':id/read')
  markRead(@Req() req: Request, @Param('id') id: string) {
    return this.service.markRead(uid(req), id);
  }

  @Patch('read-all')
  markAllRead(@Req() req: Request) {
    return this.service.markAllRead(uid(req));
  }

  @Delete('clear-all')
  clearAll(@Req() req: Request) {
    return this.service.clearAll(uid(req));
  }

  @Delete(':id')
  delete(@Req() req: Request, @Param('id') id: string) {
    return this.service.delete(uid(req), id);
  }
}
