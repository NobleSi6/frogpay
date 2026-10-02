import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { EventBusModule } from '../../shared/events/event-bus.module';
import { EmailModule } from '../../shared/email/email.module';
import { TenantCreatedEmailHandler } from './application/event-handlers/tenant-created-email.handler';

@Module({
  imports: [IdentityModule, EventBusModule, EmailModule],
  providers: [TenantCreatedEmailHandler],
})
export class NotificationsModule {}