import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { EmailSender } from './email-sender.interface';
import { buildInvitationEmail } from './invitation-email-content';

@Injectable()
export class MailpitEmailSender implements EmailSender {
  private readonly logger = new Logger(MailpitEmailSender.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST') || 'localhost',
      port: Number(this.config.get<string>('MAIL_PORT') || 1025),
      secure: false,
    });
  }

  async sendInvitation(input: {
    to: string;
    tenantName: string;
    invitationUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM') || 'FrogPay <no-reply@localhost>',
        to: input.to,
        ...buildInvitationEmail(input),
      });
    } catch (error) {
      this.logger.error(`No se pudo conectar con Mailpit: ${String(error)}`);
      throw new ServiceUnavailableException('No se pudo guardar el correo de invitación en Mailpit');
    }
  }
}