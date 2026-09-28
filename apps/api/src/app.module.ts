import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { IdentityModule } from './modules/identity/identity.module';
import { HealthModule } from './modules/health/health.module';
import { RolesGuard } from './shared/auth/roles.guard';
import { EventBusModule } from './shared/events/event-bus.module';
import { EventBusSmokePublisher } from './shared/events/event-bus-smoke-publisher';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProviderAdaptersModule } from './modules/provider-adapters/provider-adapters.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    EventBusModule,
    IdentityModule,
    HealthModule,
    PaymentsModule,
    ProviderAdaptersModule,
  ],
  providers: [
    EventBusSmokePublisher,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
