import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', 'localhost'),
      port: config.get<number>('SMTP_PORT', 1025),
      secure: config.get('SMTP_SECURE', 'false') === 'true',
      auth: config.get('SMTP_USER')
        ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASSWORD') }
        : undefined,
    });
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
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM', 'Dlander <no-reply@dlander.local>'),
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
  onModuleDestroy() {
    this.transporter.close();
  }
}
