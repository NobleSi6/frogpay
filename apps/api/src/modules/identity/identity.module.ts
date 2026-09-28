import { Module } from '@nestjs/common';
import { TenantsController } from './presentation/http/tenants.controller';
import { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import { InMemoryTenantRepository } from './infrastructure/persistence/in-memory-tenant.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { InMemoryUserRepository } from './infrastructure/persistence/in-memory-user.repository';
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository.interface';
import { InMemoryApiKeyRepository } from './infrastructure/persistence/in-memory-api-key.repository';
import { EVENT_BUS } from '../../shared/events/event-bus.interface';
import { InMemoryEventBus } from '../../shared/events/in-memory-event-bus';
import { IdentityController } from './presentation/http/identity.controller';
import { ActivateInvitationUseCase } from './application/use-cases/activate-invitation.use-case';
import { EMAIL_SENDER } from '../../shared/email/email-sender.interface';
import { ResendEmailSender } from '../../shared/email/resend-email-sender.service';

@Module({
  controllers: [TenantsController, IdentityController],
  providers: [
    CreateTenantUseCase,
    ActivateInvitationUseCase,
    ResendEmailSender,
    { provide: EMAIL_SENDER, useExisting: ResendEmailSender },
    {
      provide: TENANT_REPOSITORY,
      useClass: InMemoryTenantRepository,
    },
    {
      provide: USER_REPOSITORY,
      useClass: InMemoryUserRepository,
    },
    {
      provide: API_KEY_REPOSITORY,
      useClass: InMemoryApiKeyRepository,
    },
    {
      provide: EVENT_BUS,
      useClass: InMemoryEventBus,
    },
  ],
  exports: [
    CreateTenantUseCase,
    TENANT_REPOSITORY,
    USER_REPOSITORY,
    API_KEY_REPOSITORY,
    EVENT_BUS,
  ],
})
export class IdentityModule {}
