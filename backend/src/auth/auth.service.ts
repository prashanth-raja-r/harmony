import {
  Injectable, UnauthorizedException, BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { Otp } from '../entities/otp.entity';
import { SpaceMember } from '../entities/space-member.entity';
import { MailService } from '../mail/mail.service';
import { generateId } from '../common/db.helpers';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(Otp)
    private readonly otps: Repository<Otp>,
    @InjectRepository(SpaceMember)
    private readonly spaceMembers: Repository<SpaceMember>,
  ) {}

  // ── OTP helpers ──────────────────────────────────────────────────────────

  async sendOtp(email: string, type: 'SIGNUP' | 'LOGIN') {
    // Delete any existing unused OTPs for this email+type
    await this.otps.delete({ email: email.toLowerCase(), type });

    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.otps.save(
      this.otps.create({
        id: generateId(),
        email: email.toLowerCase(),
        code,
        type,
        expiresAt,
        usedAt: null,
      }),
    );

    await this.mailService.sendOtp(email, code, type === 'SIGNUP' ? 'signup' : 'login');
    return { message: 'OTP sent to your email.' };
  }

  private async consumeOtp(email: string, code: string, type: 'SIGNUP' | 'LOGIN') {
    const otp = await this.otps.findOne({
      where: { email: email.toLowerCase(), type, usedAt: null as unknown as Date },
    });

    if (!otp) throw new BadRequestException('Invalid or expired OTP.');
    if (otp.code !== code) throw new BadRequestException('Incorrect OTP.');
    if (otp.expiresAt < new Date()) throw new BadRequestException('OTP has expired. Please request a new one.');

    otp.usedAt = new Date();
    await this.otps.save(otp);
  }

  // ── Signup: verify email OTP → get a short-lived proof token ─────────────

  async verifySignupOtp(email: string, code: string) {
    await this.consumeOtp(email, code, 'SIGNUP');
    // Issue a short-lived token proving this email was OTP-verified
    const signupToken = this.jwtService.sign(
      { purpose: 'email_verified', email: email.toLowerCase() },
      { expiresIn: '15m' },
    );
    return { signupToken };
  }

  async signup(dto: { name: string; email: string; password: string; signupToken: string }) {
    // Verify the signup token
    let payload: { purpose: string; email: string };
    try {
      payload = this.jwtService.verify(dto.signupToken);
    } catch {
      throw new BadRequestException('Email verification expired. Please start over.');
    }
    if (payload.purpose !== 'email_verified' || payload.email !== dto.email.toLowerCase()) {
      throw new BadRequestException('Invalid signup token.');
    }

    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
    });

    // Auto-accept any space invites sent to this email — they join immediately on signup
    const pendingInvites = await this.spaceMembers.find({
      where: { inviteEmail: user.email.toLowerCase(), status: 'PENDING' },
    });
    if (pendingInvites.length > 0) {
      await this.spaceMembers.save(
        pendingInvites.map((inv) => ({
          ...inv,
          userId: user.id,
          inviteEmail: null,
          status: 'ACCEPTED',
          joinedAt: new Date(),
        })),
      );
    }

    const accessToken = this.signToken(user.id, user.email);
    this.mailService.sendWelcome(user.email, user.name ?? 'there').catch(() => {});
    return { user, accessToken };
  }

  // ── Login: verify password → send OTP; then verify OTP → JWT ─────────────

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.password) throw new UnauthorizedException('Invalid email or password.');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid email or password.');

    // Credentials OK — send OTP and tell frontend to show OTP step
    await this.sendOtp(email, 'LOGIN');
    return { status: 'otp_sent' as const };
  }

  async verifyLoginOtp(email: string, code: string) {
    await this.consumeOtp(email, code, 'LOGIN');
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('User not found.');
    const { password: _pw, ...safeUser } = user;
    return { user: safeUser, accessToken: this.signToken(safeUser.id, safeUser.email) };
  }

  // ── Password reset ────────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return { message: 'If an account exists, a reset link has been sent.' };

    await this.resetTokens.delete({ userId: user.id });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.resetTokens.save(
      this.resetTokens.create({ id: generateId(), userId: user.id, token, expiresAt, usedAt: null }),
    );

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    void this.mailService.sendPasswordReset(
      user.email, user.name ?? 'there',
      `${frontendUrl}/reset-password?token=${token}`,
    );
    return { message: 'If an account exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.resetTokens.findOne({ where: { token } });
    if (!record || record.usedAt) throw new BadRequestException('Invalid or already-used reset link.');
    if (record.expiresAt < new Date()) throw new BadRequestException('Reset link has expired.');

    await this.usersService.updatePassword(record.userId, await bcrypt.hash(newPassword, 12));
    record.usedAt = new Date();
    await this.resetTokens.save(record);
    return { message: 'Password updated successfully.' };
  }

  private signToken(userId: string, email: string) {
    return this.jwtService.sign({ sub: userId, email });
  }
}
