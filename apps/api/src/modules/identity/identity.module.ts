import { Module } from '@nestjs/common';
import { TenantsController } from './presentation/http/tenants.controller';
import { CreateTenantUseCase } from './application/use-cases/create-tenant.use-case';
import { TENANT_REGISTRATION_REPOSITORY } from './application/ports/tenant-registration.repository';
import { TENANT_REPOSITORY } from './domain/repositories/tenant.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { API_KEY_REPOSITORY } from './domain/repositories/api-key.repository.interface';
import {
  PrismaApiKeyRepository,
  PrismaTenantRegistrationRepository,
  PrismaTenantRepository,
  PrismaUserRepository,
} from './infrastructure/persistence/prisma-identity.repositories';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { TenantEventProbe } from './infrastructure/events/tenant-event-probe';
import { IdentityController } from './presentation/http/identity.controller';
import { ActivateInvitationUseCase } from './application/use-cases/activate-invitation.use-case';
import { ApiKeysController } from './presentation/http/api-keys.controller';
import { GenerateApiKeyUseCase } from './application/use-cases/generate-api-key.use-case';
import { ListApiKeysUseCase } from './application/use-cases/list-api-keys.use-case';
import { RevokeApiKeyUseCase } from './application/use-cases/revoke-api-key.use-case';
import { RegenerateApiKeyUseCase } from './application/use-cases/regenerate-api-key.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { ListTenantsUseCase } from './application/use-cases/list-tenants.use-case';
import { JwtTokenService } from '../../shared/auth/jwt-token.service';

@Module({
  controllers: [TenantsController, IdentityController, ApiKeysController],
  imports: [EventBusModule],
  providers: [
    TenantEventProbe,
    PrismaTenantRegistrationRepository,
    { provide: TENANT_REGISTRATION_REPOSITORY, useExisting: PrismaTenantRegistrationRepository },
    CreateTenantUseCase,
    ActivateInvitationUseCase,
    GenerateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    RegenerateApiKeyUseCase,
    LoginUseCase,
    GetCurrentUserUseCase,
    ListTenantsUseCase,
    JwtTokenService,
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
