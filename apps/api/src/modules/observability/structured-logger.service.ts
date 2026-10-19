import { Injectable, LoggerService } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSpanContextValid,
  trace as otelTrace,
} from '@opentelemetry/api';

type LogLevel = 'log' | 'warn' | 'error' | 'debug' | 'verbose';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly logDirectory = join(process.cwd(), 'logs');
  private readonly logFile = join(
    this.logDirectory,
    'frogpay.jsonl',
  );

  constructor() {
    mkdirSync(this.logDirectory, {
      recursive: true,
    });
  }

  private readonly sensitiveKeys = new Set([
    'password',
    'secret',
    'clientsecret',
    'apikey',
    'authorization',
    'cookie',
    'setcookie',
    'token',
    'accesstoken',
    'refreshtoken',
    'cardnumber',
    'pan',
    'cvv',
    'cvc',
    'securitycode',
    'webhooksecret',
    'privatekey',
    'bankaccount',
  ]);

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private sanitizeString(value: string): string {
    return value
      .replace(
        /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
        'Bearer [REDACTED]',
      )
      .replace(
        /\b(?:\d[ -]*?){13,19}\b/g,
        '[REDACTED_CARD]',
      )
      .replace(
        /-----BEGIN [^-]+PRIVATE KEY-----[\s\S]*?-----END [^-]+PRIVATE KEY-----/g,
        '[REDACTED_PRIVATE_KEY]',
      );
  }

  private sanitize(
    value: unknown,
    seen = new WeakSet<object>(),
  ): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return '[CIRCULAR]';
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const result = value.map((item) =>
        this.sanitize(item, seen),
      );
      seen.delete(value);
      return result;
    }

    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      if (this.sensitiveKeys.has(this.normalizeKey(key))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = this.sanitize(item, seen);
      }
    }

    seen.delete(value);
    return result;
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ): void {
    const activeSpanContext = otelTrace.getActiveSpan()?.spanContext();
    const traceContext =
      activeSpanContext && isSpanContextValid(activeSpanContext)
        ? {
            traceId: activeSpanContext.traceId,
            spanId: activeSpanContext.spanId,
          }
        : {};

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? 'FrogPay',
      ...traceContext,
      message: this.sanitize(message),
      ...(trace
        ? { trace: this.sanitizeString(trace) }
        : {}),
    };

    const serialized = JSON.stringify(entry);

    try {
      appendFileSync(
        this.logFile,
        serialized + '\n',
        { encoding: 'utf8' },
      );
    } catch {
      process.stderr.write(
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          context: StructuredLoggerService.name,
          message: 'No se pudo escribir en el archivo local de logs.',
        })}\n`,
      );
    }

    if (level === 'error') {
      process.stderr.write(serialized + '\n');
    } else {
      process.stdout.write(serialized + '\n');
    }
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  error(
    message: unknown,
    trace?: string,
    context?: string,
  ): void {
    this.write('error', message, context, trace);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }
}
