import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from './email-sender.interface';
import { buildInvitationEmail } from './invitation-email-content';

@Injectable()
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);

  constructor(private readonly config: ConfigService) {}

  async sendInvitation(input: {
    to: string;
    tenantName: string;
    invitationUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (!apiKey || !from) {
      throw new ServiceUnavailableException('El envío de correo no está configurado');
    }

    const email = buildInvitationEmail(input);
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          ...email,
        }),
      });
    } catch (error) {
      this.logger.error(`No se pudo conectar con el proveedor de correo: ${String(error)}`);
      throw new ServiceUnavailableException('No se pudo enviar el correo de invitación');
    }

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`El proveedor de correo respondió ${response.status}: ${detail}`);
      throw new InternalServerErrorException('El proveedor rechazó el correo de invitación');
    }
  }

}
