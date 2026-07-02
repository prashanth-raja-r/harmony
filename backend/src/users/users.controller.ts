import { Controller, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService, OnboardDto } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('onboard')
  async onboard(
    @Req() req: { user: { id: string } },
    @Body() body: OnboardDto,
  ) {
    return this.usersService.completeOnboarding(req.user.id, body);
  }
}
