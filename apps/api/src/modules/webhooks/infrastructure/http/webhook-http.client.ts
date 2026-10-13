import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WebhookHttpRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

export interface WebhookHttpResult {
  status: number | null;
  error: string | null;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 3000;
const ERROR_MAX_CHARS = 500;

/** Envía un webhook con timeout estricto (3.000 ms por defecto). Nunca lanza excepciones. */
@Injectable()
export class WebhookHttpClient {
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const raw = Number(config.get<string>('WEBHOOK_TIMEOUT_MS'));
    this.timeoutMs = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  }

  async send(request: WebhookHttpRequest): Promise<WebhookHttpResult> {
    const started = Date.now();
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...request.headers },
        body: request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      // Se consume el cuerpo para liberar la conexión, sin guardarlo.
      await response.arrayBuffer().catch(() => undefined);
      return { status: response.status, error: null, durationMs: Date.now() - started };
    } catch (error) {
      const err = error as { name?: string; message?: string; cause?: { code?: string } };
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const detail = err?.cause?.code ?? err?.message ?? 'desconocido';
      const message = isTimeout
        ? `Timeout de ${this.timeoutMs} ms sin respuesta del endpoint`
        : `Error de red: ${detail}`;
      return { status: null, error: message.slice(0, ERROR_MAX_CHARS), durationMs: Date.now() - started };
    }
  }
}
