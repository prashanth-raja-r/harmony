import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from: string;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = parseInt(config.get<string>('SMTP_PORT') ?? '587', 10);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('MAIL_FROM') ?? `Harmony Finance <${user ?? 'noreply@harmony.app'}>`;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Mail service ready via ${host}:${port}`);
    } else {
      this.logger.warn('SMTP not configured — emails will be skipped. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    }
  }

  async sendWelcome(to: string, name: string) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    await this.send(to, 'Welcome to Harmony 🎉', this.welcomeHtml(name, frontendUrl));
  }

  async sendPasswordReset(to: string, name: string, resetUrl: string) {
    await this.send(to, 'Reset your Harmony password', this.resetHtml(name, resetUrl));
  }

  async sendSpaceInvite(
    to: string,
    spaceName: string,
    inviterName: string,
    frontendUrl: string,
    hasAccount: boolean,
  ) {
    const subject = `${inviterName} invited you to "${spaceName}" on Harmony`;
    await this.send(to, subject, this.spaceInviteHtml(spaceName, inviterName, frontendUrl, hasAccount));
  }

  async sendOtp(to: string, code: string, purpose: 'signup' | 'login') {
    const subject = purpose === 'signup'
      ? 'Your Harmony verification code'
      : 'Your Harmony login code';
    await this.send(to, subject, this.otpHtml(code, purpose));
  }

  private async send(to: string, subject: string, html: string) {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}`, err);
    }
  }

  private welcomeHtml(name: string, frontendUrl: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#3d7a5f 0%,#2a5440 100%);padding:48px 40px;text-align:center;">
          <div style="font-size:36px;font-weight:300;color:#fff;letter-spacing:-1px;font-family:Georgia,'Times New Roman',serif;margin-bottom:8px;">harmony</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.5px;">Your personal finance companion</div>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;">Welcome, ${name}! 🎉</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.7;">
            You've taken the first step toward financial clarity. Here's what's waiting for you in Harmony:
          </p>
          <!-- Features -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f8f5;border-radius:14px;padding:24px;margin-bottom:28px;">
            <tr><td style="padding:0 0 16px;">
              <span style="font-size:22px;">💳</span>&nbsp;
              <strong style="color:#111827;font-size:15px;">Debt Tracker</strong>
              <div style="margin:3px 0 0 30px;font-size:13px;color:#9ca3af;">EMI calendars, payoff timelines &amp; strategies</div>
            </td></tr>
            <tr><td style="padding:0 0 16px;">
              <span style="font-size:22px;">📊</span>&nbsp;
              <strong style="color:#111827;font-size:15px;">Spending Insights</strong>
              <div style="margin:3px 0 0 30px;font-size:13px;color:#9ca3af;">Category trends, monthly reports &amp; CSV export</div>
            </td></tr>
            <tr><td style="padding:0 0 16px;">
              <span style="font-size:22px;">🎯</span>&nbsp;
              <strong style="color:#111827;font-size:15px;">Goals &amp; Savings</strong>
              <div style="margin:3px 0 0 30px;font-size:13px;color:#9ca3af;">Set milestones and watch your progress</div>
            </td></tr>
            <tr><td style="padding:0;">
              <span style="font-size:22px;">👥</span>&nbsp;
              <strong style="color:#111827;font-size:15px;">Finspaces</strong>
              <div style="margin:3px 0 0 30px;font-size:13px;color:#9ca3af;">Shared finance spaces for family &amp; friends</div>
            </td></tr>
          </table>
          <!-- CTA -->
          <a href="${frontendUrl}" style="display:block;background:linear-gradient(135deg,#3d7a5f,#2a5440);color:#fff;text-align:center;padding:16px 24px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.2px;margin-bottom:28px;">
            Open your Dashboard →
          </a>
          <p style="margin:0;font-size:13px;color:#d1d5db;text-align:center;">
            If you didn't create this account, please ignore this email.
          </p>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f9f8f5;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Harmony Finance · Built for clarity, not complexity</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  }

  private spaceInviteHtml(spaceName: string, inviterName: string, frontendUrl: string, hasAccount: boolean) {
    const ctaUrl = hasAccount ? `${frontendUrl}/finspaces` : `${frontendUrl}/signup`;
    const ctaText = hasAccount ? 'View invitation →' : 'Create free account →';
    const body = hasAccount
      ? `<strong>${inviterName}</strong> has invited you to join the <strong>"${spaceName}"</strong> space on Harmony. Accept the invite from your Finspaces page.`
      : `<strong>${inviterName}</strong> has invited you to join the <strong>"${spaceName}"</strong> space on Harmony — a personal finance app to track spending, debts, and goals together.<br><br>Create a free account to accept the invite.`;
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#3d7a5f 0%,#2a5440 100%);padding:40px 40px 32px;text-align:center;">
          <div style="font-size:32px;font-weight:300;color:#fff;letter-spacing:-1px;font-family:Georgia,'Times New Roman',serif;margin-bottom:6px;">harmony</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.75);">You've been invited</div>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px 32px;">
          <div style="font-size:32px;text-align:center;margin-bottom:16px;">👥</div>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;text-align:center;">${body}</p>
          <a href="${ctaUrl}" style="display:block;background:linear-gradient(135deg,#3d7a5f,#2a5440);color:#fff;text-align:center;padding:16px 24px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:600;margin-bottom:24px;">${ctaText}</a>
          <p style="margin:0;font-size:12px;color:#d1d5db;text-align:center;">If you weren't expecting this, you can safely ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f9f8f5;padding:18px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Harmony Finance · Built for clarity, not complexity</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  }

  private otpHtml(code: string, purpose: 'signup' | 'login') {
    const title = purpose === 'signup' ? 'Verify your email' : 'Login verification';
    const subtitle = purpose === 'signup'
      ? 'Enter this code to confirm your email address'
      : 'Enter this code to complete sign-in';
    const digits = code.split('');
    const digitCells = digits.map(
      (d) => `<td style="width:44px;height:56px;background:#f9f8f5;border:2px solid #e5e7eb;border-radius:10px;text-align:center;vertical-align:middle;font-size:28px;font-weight:700;color:#111827;font-family:monospace;">${d}</td>`
    ).join('<td style="width:6px;"></td>');
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#3d7a5f 0%,#2a5440 100%);padding:40px 40px 32px;text-align:center;">
          <div style="font-size:32px;font-weight:300;color:#fff;letter-spacing:-1px;font-family:Georgia,'Times New Roman',serif;margin-bottom:6px;">harmony</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.75);">${title}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 40px 32px;text-align:center;">
          <p style="margin:0 0 8px;font-size:15px;color:#6b7280;">${subtitle}</p>
          <table cellpadding="0" cellspacing="0" style="margin:28px auto;">
            <tr>${digitCells}</tr>
          </table>
          <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:14px 20px;margin-top:8px;">
            <p style="margin:0;font-size:13px;color:#92400e;">⏱️ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
          </div>
          <p style="margin:28px 0 0;font-size:12px;color:#d1d5db;">If you didn't request this code, you can safely ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f9f8f5;padding:18px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Harmony Finance · Built for clarity, not complexity</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  }

  private resetHtml(name: string, resetUrl: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#3d7a5f 0%,#2a5440 100%);padding:48px 40px;text-align:center;">
          <div style="font-size:36px;font-weight:300;color:#fff;letter-spacing:-1px;font-family:Georgia,'Times New Roman',serif;margin-bottom:8px;">harmony</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.75);letter-spacing:0.5px;">Password reset request</div>
        </td>
      </tr>
      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;">Hi ${name},</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.7;">
            We received a request to reset the password for your Harmony account. Click the button below to set a new password.
          </p>
          <!-- CTA -->
          <a href="${resetUrl}" style="display:block;background:linear-gradient(135deg,#3d7a5f,#2a5440);color:#fff;text-align:center;padding:16px 24px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.2px;margin-bottom:24px;">
            Reset my password →
          </a>
          <!-- Warning -->
          <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              ⏱️ <strong>This link expires in 1 hour.</strong><br>
              If you didn't request a password reset, you can safely ignore this email — your password won't change.
            </p>
          </div>
          <!-- Fallback URL -->
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color:#3d7a5f;word-break:break-all;">${resetUrl}</a>
          </p>
        </td>
      </tr>
      <!-- Footer -->
      <tr>
        <td style="background:#f9f8f5;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Harmony Finance · Built for clarity, not complexity</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  }
}
