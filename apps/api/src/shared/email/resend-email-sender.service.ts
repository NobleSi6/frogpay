import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from './email-sender.interface';

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
          subject: `Activa tu cuenta de FrogPay para ${input.tenantName}`,
          html: `<p>Hola,</p><p>Se creó una cuenta de FrogPay para <strong>${this.escapeHtml(input.tenantName)}</strong>.</p><p><a href="${this.escapeHtml(input.invitationUrl)}">Definir contraseña y activar cuenta</a></p><p>Este enlace vence el ${input.expiresAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}.</p><p>Si no esperabas esta invitación, puedes ignorar este correo.</p>`,
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

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]!);
  }
}
