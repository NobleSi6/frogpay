import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEnvironment } from './config/env.validation.js';
import { PrismaModule } from './shared/database/index.js';

const appDirectory = dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(appDirectory, '../../..', '.env'),
      validate: validateEnvironment,
    }),
    PrismaModule,
  ],
})
export class AppModule {}