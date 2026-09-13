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
    const subject = 'کد تأیید ایمیل دیلندر';
    const text = [
      'کد تأیید ایمیل شما:',
      code,
      '',
      `این کد تا ${expires} معتبر است.`,
      'کد را در صفحه تأیید ایمیل وارد کنید.',
      '',
      'اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید.',
    ].join('\n');
    const html = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7;color:#111">
        <p>کد تأیید ایمیل شما:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p>این کد تا <strong>${expires}</strong> معتبر است.</p>
        <p>کد را در صفحه تأیید ایمیل اپلیکیشن وارد کنید.</p>
        <p style="color:#666;font-size:13px">اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید.</p>
      </div>
    `;
    await this.send(email, subject, text, html);
  }

  async sendPasswordReset(email: string, code: string) {
    const expires = this.config.get('PASSWORD_RESET_EXPIRES_IN', '1h');
    const subject = 'کد بازیابی رمز عبور دیلندر';
    const text = [
      'کد بازیابی رمز عبور شما:',
      code,
      '',
      `این کد تا ${expires} معتبر است.`,
      'کد را در صفحه بازیابی رمز وارد کنید و رمز جدید بسازید.',
      '',
      'اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید و رمز فعلی را تغییر دهید.',
    ].join('\n');
    const html = `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.7;color:#111">
        <p>کد بازیابی رمز عبور شما:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
        <p>این کد تا <strong>${expires}</strong> معتبر است.</p>
        <p>کد را در صفحه بازیابی رمز اپلیکیشن وارد کنید و رمز جدید بسازید.</p>
        <p style="color:#666;font-size:13px">اگر این درخواست از طرف شما نبوده، این ایمیل را نادیده بگیرید.</p>
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
