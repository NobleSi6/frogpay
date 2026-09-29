import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantsController } from './presentation/http/tenants.controller';
import { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository.interface';
import {
  PrismaApiKeyRepository,
  PrismaTenantRepository,
  PrismaUserRepository,
} from './infrastructure/persistence/prisma-identity.repositories';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { TenantEventProbe } from './infrastructure/events/tenant-event-probe';
import { IdentityController } from './presentation/http/identity.controller';
import { ActivateInvitationUseCase } from './application/use-cases/activate-invitation.use-case';
import { EMAIL_SENDER } from '../../shared/email/email-sender.interface';
import { EmailSender } from '../../shared/email/email-sender.interface';
import { ResendEmailSender } from '../../shared/email/resend-email-sender.service';
import { MailpitEmailSender } from '../../shared/email/mailpit-email-sender.service';
import { ApiKeysController } from './presentation/http/api-keys.controller';
import { GenerateApiKeyUseCase } from './application/use-cases/generate-api-key.use-case';
import { ListApiKeysUseCase } from './application/use-cases/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from './application/use-cases/revoke-api-key.use-case';

@Module({
  controllers: [TenantsController, IdentityController, ApiKeysController],
  imports: [EventBusModule],
  providers: [
    TenantEventProbe,
    CreateTenantUseCase,
    ActivateInvitationUseCase,
    GenerateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    ResendEmailSender,
    MailpitEmailSender,
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService, ResendEmailSender, MailpitEmailSender],
      useFactory: (
        config: ConfigService,
        resendEmailSender: ResendEmailSender,
        mailpitEmailSender: MailpitEmailSender,
      ): EmailSender => {
        const provider = config.get<string>('MAIL_PROVIDER')
          ?? (config.get<string>('NODE_ENV') === 'development' ? 'mailpit' : 'resend');
        return provider === 'mailpit' ? mailpitEmailSender : resendEmailSender;
      },
    },
    {
      provide: TENANT_REPOSITORY,
      useClass: PrismaTenantRepository,
    },
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    {
      provide: API_KEY_REPOSITORY,
      useClass: PrismaApiKeyRepository,
    },
  ],
  exports: [
    CreateTenantUseCase,
    TENANT_REPOSITORY,
    USER_REPOSITORY,
    API_KEY_REPOSITORY,
    EventBusModule,
  ],
})
export class IdentityModule {}
