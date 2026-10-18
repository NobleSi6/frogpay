import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/http/http-exception.filter';
import { RequestIdMiddleware } from './shared/http/middleware/request-id.middleware';
import { TimingInterceptor } from './shared/http/timing.interceptor';
import { StructuredLoggerService } from './modules/observability/structured-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const structuredLogger = app.get(StructuredLoggerService);
  app.useLogger(structuredLogger);
  const logger = new Logger('FrogPay-API');
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 4000);
  const corsOrigin = configService.get<string>('corsOrigin', 'http://localhost:3000');

  // CORS
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Prefijo global de API excluyendo /health y /metrics
  app.setGlobalPrefix('api', {
    exclude: ['health', 'metrics'],
  });

  // Interceptores y Filtros globales
  app.useGlobalInterceptors(new TimingInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Validación global de DTOs con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Documentación OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FrogPay API - Payment Gateway')
    .setDescription(
      'Documentación técnica y endpoints de la pasarela de pagos SaaS multi-tenant FrogPay (EDA + Clean Architecture).',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Tenants', 'Operaciones de gestión y onboarding de empresas')
    .addTag('Health', 'Sondas de salud y monitoreo del sistema')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logger.log(`🚀 FrogPay API ejecutándose en: http://localhost:${port}`);
  logger.log(`📑 Documentación Swagger disponible en: http://localhost:${port}/api/docs`);
  logger.log(`🩺 Endpoint de Health Check en: http://localhost:${port}/health`);
}

bootstrap();
