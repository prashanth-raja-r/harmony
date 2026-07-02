import {
  Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  IsEmail, IsString, MinLength, MaxLength, IsIn, Length,
} from 'class-validator';

export class SendOtpDto {
  @IsEmail() email!: string;
  @IsIn(['SIGNUP', 'LOGIN']) type!: 'SIGNUP' | 'LOGIN';
}

export class VerifyOtpDto {
  @IsEmail() email!: string;
  @IsString() @Length(6, 6) code!: string;
}

export class SignupDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsString() @MinLength(1) signupToken!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(1) token!: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword!: string;
}

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 5 OTP sends per 10 min — prevents email spam
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.email, dto.type);
  }

  // 10 verify attempts per 10 min
  @Post('verify-signup-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  verifySignupOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifySignupOtp(dto.email, dto.code);
  }

  @Post('signup')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  // 10 login attempts per min — brute-force protection
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('verify-login-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  verifyLoginOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyLoginOtp(dto.email, dto.code);
  }

  // 3 reset requests per 10 min
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: Express.Request & { user: Record<string, unknown> }) {
    return req.user;
  }
}
