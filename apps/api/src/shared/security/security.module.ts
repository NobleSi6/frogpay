import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../database/prisma.module';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitService } from './rate-limit.service';

/** Rate limiting global por tenant y API Key. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [RateLimitService, { provide: APP_INTERCEPTOR, useClass: RateLimitInterceptor }],
  exports: [RateLimitService],
})
export class SecurityModule {}
