import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpacesService, CreateSpaceDto, InviteMemberDto, UpdateMemberDto } from './spaces.service';
import { Request } from 'express';

function uid(req: Request) {
  return (req.user as { id: string }).id;
}

@Controller('spaces')
@UseGuards(JwtAuthGuard)
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.spacesService.listSpaces(uid(req));
  }

  @Get('invites')
  invites(@Req() req: Request) {
    return this.spacesService.getPendingInvites(uid(req));
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.spacesService.getSpace(uid(req), id);
  }

  @Get(':id/dashboard')
  dashboard(@Req() req: Request, @Param('id') id: string) {
    return this.spacesService.getSpaceDashboard(uid(req), id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateSpaceDto) {
    return this.spacesService.createSpace(uid(req), dto);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: Partial<{ name: string; description: string }>) {
    return this.spacesService.updateSpace(uid(req), id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.spacesService.deleteSpace(uid(req), id);
  }

  @Post(':id/invite')
  invite(@Req() req: Request, @Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.spacesService.inviteMember(uid(req), id, dto);
  }

  @Patch('invites/:memberId/accept')
  acceptInvite(@Req() req: Request, @Param('memberId') memberId: string) {
    return this.spacesService.acceptInvite(uid(req), memberId);
  }

  @Delete('invites/:memberId')
  declineInvite(@Req() req: Request, @Param('memberId') memberId: string) {
    return this.spacesService.declineInvite(uid(req), memberId);
  }

  @Patch(':id/members/:userId/role')
  updateRole(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.spacesService.updateMemberRole(uid(req), id, targetUserId, dto);
  }

  @Delete(':id/pending-members/:memberId')
  cancelInvite(@Req() req: Request, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.spacesService.cancelInvite(uid(req), id, memberId);
  }

  @Delete(':id/members/:userId')
  removeMember(@Req() req: Request, @Param('id') id: string, @Param('userId') targetUserId: string) {
    return this.spacesService.removeMember(uid(req), id, targetUserId);
  }
}
