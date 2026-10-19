import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { StructuredLoggerService } from './structured-logger.service';
import { OutboxMetricsCollector } from './outbox-metrics.collector';
import { PrismaModule } from '../../shared/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    HttpMetricsMiddleware,
    StructuredLoggerService,
    OutboxMetricsCollector,
  ],
  exports: [
    MetricsService,
    StructuredLoggerService,
  ],
})
export class ObservabilityModule
  implements NestModule
{
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpMetricsMiddleware)
      .forRoutes('*');
  }
}
