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

  async sendVerification(email: string, token: string) {
    const url = `${this.config.getOrThrow<string>('FRONTEND_URL')}/verify-email?token=${encodeURIComponent(token)}`;
    await this.send(
      email,
      'Verify your email',
      `Verify your email: ${url}`,
      `<p>Verify your email: <a href="${url}">${url}</a></p>`,
    );
  }

  async sendPasswordReset(email: string, token: string) {
    const url = `${this.config.getOrThrow<string>('FRONTEND_URL')}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      email,
      'Reset your password',
      `Reset your password: ${url}`,
      `<p>Reset your password: <a href="${url}">${url}</a></p>`,
    );
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
