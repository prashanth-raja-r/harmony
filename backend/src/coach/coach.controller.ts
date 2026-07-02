import { Controller, Post, Get, Param, Body, Req, Res, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoachService } from './coach.service';
import { Request, Response } from 'express';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

class ChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];
}

@Controller('coach')
@UseGuards(JwtAuthGuard)
export class CoachController {
  constructor(private readonly coachService: CoachService) {}

  @Get('insights')
  async insights(@Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.coachService.getInsights(userId);
  }

  @Get('answer/:questionId')
  async answer(@Param('questionId') questionId: string, @Req() req: Request) {
    const userId = (req.user as { id: string }).id;
    return this.coachService.answerQuestion(userId, questionId);
  }

  @Post('chat')
  async chat(@Body() body: ChatDto, @Req() req: Request, @Res() res: Response) {
    const userId = (req.user as { id: string }).id;
    await this.coachService.streamChat(userId, body.messages, res);
  }
}
