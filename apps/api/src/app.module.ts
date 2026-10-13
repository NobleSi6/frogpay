import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { resolve } from 'node:path';
import configuration from './config/configuration';
import { validateEnvironment } from './config/env.validation';
import { IdentityModule } from './modules/identity/identity.module';
import { HealthModule } from './modules/health/health.module';
import { RolesGuard } from './shared/auth/roles.guard';
import { AuthenticationGuard } from './shared/auth/authentication.guard';
import { JwtTokenService } from './shared/auth/jwt-token.service';
import { EventBusModule } from './shared/events/event-bus.module';
import { EventBusSmokePublisher } from './shared/events/event-bus-smoke-publisher';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProviderAdaptersModule } from './modules/provider-adapters/provider-adapters.module';
import { PrismaModule } from './shared/database/prisma.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PlansModule } from './modules/plans/plans.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
      load: [configuration],
      validate: validateEnvironment,
    }),
    PrismaModule,
    EventBusModule,
    IdentityModule,
    NotificationsModule,
    HealthModule,
    PaymentsModule,
    ProviderAdaptersModule,
    PlansModule,
    DashboardModule,
  ],
  providers: [
    EventBusSmokePublisher,
    JwtTokenService,
    {
      provide: APP_GUARD,
      useClass: AuthenticationGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
