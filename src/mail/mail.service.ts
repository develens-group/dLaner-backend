import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    if (this.transport() === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.get('SMTP_HOST', 'localhost'),
        port: config.get<number>('SMTP_PORT', 1025),
        secure: config.get('SMTP_SECURE', 'false') === 'true',
        auth: config.get('SMTP_USER')
          ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASSWORD') }
          : undefined,
      });
    }
  }

  async sendVerification(email: string, code: string) {
    const expires = this.config.get('EMAIL_VERIFICATION_EXPIRES_IN', '24h');
    const subject = 'Your Dlander email verification code';
    const text = [
      'Your email verification code is:',
      code,
      '',
      `This code expires in ${expires}.`,
      'Enter it on the email verification screen in the app.',
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <p>Your email verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p>This code expires in <strong>${expires}</strong>.</p>
        <p>Enter it on the email verification screen in the app.</p>
        <p style="color:#666;font-size:13px">If you did not request this, you can ignore this email.</p>
      </div>
    `;
    await this.send(email, subject, text, html);
  }

  async sendPasswordReset(email: string, code: string) {
    const expires = this.config.get('PASSWORD_RESET_EXPIRES_IN', '1h');
    const subject = 'Your Dlander password reset code';
    const text = [
      'Your password reset code is:',
      code,
      '',
      `This code expires in ${expires}.`,
      'Enter it on the password reset screen and choose a new password.',
      '',
      'If you did not request this, ignore this email and keep your current password.',
    ].join('\n');
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <p>Your password reset code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p>This code expires in <strong>${expires}</strong>.</p>
        <p>Enter it on the password reset screen and choose a new password.</p>
        <p style="color:#666;font-size:13px">If you did not request this, ignore this email and keep your current password.</p>
      </div>
    `;
    await this.send(email, subject, text, html);
  }

  private async send(to: string, subject: string, text: string, html: string) {
    try {
      if (this.transport() === 'resend') {
        await this.sendWithResend(to, subject, text, html);
        return;
      }
      if (!this.transporter)
        throw new Error('SMTP transport is not configured');
      await this.transporter.sendMail({
        from: this.from(),
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      this.logger.error(
        `Email delivery failed for ${subject}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async sendWithResend(
    to: string,
    subject: string,
    text: string,
    html: string,
  ) {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from(),
        to: [to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!result.ok) {
      const details = await result.text();
      throw new Error(
        `Resend API returned ${result.status}: ${details.slice(0, 500)}`,
      );
    }
  }

  private transport() {
    return this.config.get<'smtp' | 'resend'>('MAIL_TRANSPORT', 'smtp');
  }

  private from() {
    return this.config.get('MAIL_FROM', 'Dlander <no-reply@dlander.local>');
  }

  onModuleDestroy() {
    this.transporter?.close();
  }
}
