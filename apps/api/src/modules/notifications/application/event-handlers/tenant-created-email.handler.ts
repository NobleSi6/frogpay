import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, EmailSender } from '../../../../shared/email/email-sender.interface';
import { EVENT_BUS, EventHandler, IEventBus } from '../../../../shared/events/event-bus.interface';
import { EventCatalog } from '../../../../shared/events/event-catalog';
import { DomainEvent } from '../../../../shared/domain/domain-event.base';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import { IUserRepository, USER_REPOSITORY } from '../../../identity/domain/repositories/user.repository.interface';
import { TenantCreatedEventPayload } from '../../../identity/domain/events/tenant-created.event';

@Injectable()
export class TenantCreatedEmailHandler implements OnModuleInit, EventHandler<TenantCreatedEventPayload> {
  readonly queueName = 'frogpay.notifications.tenant-created';
  private readonly logger = new Logger(TenantCreatedEmailHandler.name);

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe(EventCatalog.TENANT_CREADO, this);
  }

  async handle(event: DomainEvent<TenantCreatedEventPayload>): Promise<void> {
    const owner = await this.userRepository.findById(event.payload.owner.userId);
    if (!owner) throw new Error(`No se encontró al owner ${event.payload.owner.userId} del evento tenant.creado`);
    if (owner.status !== 'invited') return;

    const invitationToken = CryptoUtil.generateSecureToken(32);
    owner.issueInvitation(CryptoUtil.hashString(invitationToken), 72);
    await this.userRepository.save(owner);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const invitationUrl = new URL(`/activar-cuenta/${invitationToken}`, frontendUrl);
    invitationUrl.searchParams.set('email', owner.email.value);

    const maxAttempts = 3;
    const retryDelayMs = 100;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.emailSender.sendInvitation({
          to: owner.email.value,
          tenantName: event.payload.name,
          invitationUrl: invitationUrl.toString(),
          expiresAt: owner.invitationExpiresAt!,
        });
        this.logger.log(`Invitación enviada para tenant ${event.payload.tenantId}`);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Intento ${attempt}/${maxAttempts} de correo falló: ${this.errorMessage(error)}`);
        if (attempt < maxAttempts) await this.delay(retryDelayMs * attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No se pudo enviar la invitación');
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}