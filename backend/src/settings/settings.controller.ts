import { Controller, Get, Patch, Delete, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService, UpdateSettingsDto } from './settings.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('profile')
  profile(@Req() req: Request) {
    return this.settingsService.getProfile(uid(req));
  }

  @Patch('profile')
  update(@Req() req: Request, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateProfile(uid(req), dto);
  }

  @Delete('account')
  deleteAccount(@Req() req: Request) {
    return this.settingsService.deleteAccount(uid(req));
  }
}
