import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Stripe from 'stripe';
import {
  AuthorizeInput,
  CaptureInput,
  PaymentProviderPort,
  ProviderMetadata,
  ProviderResult,
  QueryStatusInput,
} from '../../ports/payment-provider.port';
import { toStripeAmount } from './stripe-amount';
import { STRIPE_CLIENT } from './stripe-client.provider';
import {
  isTimeoutError,
  mapStripeErrorToResult,
  StripeRequestTimeoutError,
} from './stripe-error.mapper';
import { AdapterErrorCode, mapPaymentIntentToResult } from './stripe-payment-intent.mapper';
import { STRIPE_PROVIDER_CONFIG, StripeProviderConfig } from './stripe-provider.config';

/**
 * Implementación de `PaymentProviderPort` sobre Stripe.
 *
 * Dos decisiones que conviene no perder de vista al leer el código:
 *
 * 1. `authorize()` manda la clave de idempotencia como opción nativa del request
 *    (`{ idempotencyKey }`). Sin eso, un reintento de `payments` crearía un
 *    segundo PaymentIntent y cobraría dos veces.
 * 2. El presupuesto de 3000 ms se aplica con las dos Mechanisms disponibles: el
 *    timeout nativo del SDK (inactividad del socket) y un reloj de pared. El
 *    nativo por sí solo no es un techo duro, porque se reinicia con cada byte
 *    que llega; el reloj de pared sí lo es.
 */
@Injectable()
export class StripePaymentProviderAdapter implements PaymentProviderPort {
  readonly metadata: ProviderMetadata = {
    id: 'stripe',
    displayName: 'Stripe',
    methods: [
      {
        code: 'card',
        label: 'Tarjeta',
        processingMode: 'synchronous',
        requiresPaymentToken: true,
        fees: {
          // MVP reference values; they do not affect the existing payment flow.
          fixedAmount: '0.30',
          variableBps: 290,
          currency: 'USD',
        },
      },
    ],
  };

  private readonly logger = new Logger(StripePaymentProviderAdapter.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    @Inject(STRIPE_PROVIDER_CONFIG) private readonly config: StripeProviderConfig,
  ) {}

  async authorize(input: AuthorizeInput): Promise<ProviderResult> {
    // La capa HTTP debe validar el formato con DTO/class-validator antes de
    // llamar al adapter. Si incumple ese contrato, InvalidStripeAmountError se
    // propaga y el filtro global lo trataría como internal_error (500).
    const amount = toStripeAmount(input.amount, input.currency);

    const currency = input.currency.trim().toLowerCase();

    try {
      // `confirm: true` hace que Stripe capture de inmediato: no hay una segunda
      // llamada monetaria pendiente. Si la tarjeta falla, el SDK lanza
      // StripeCardError y el mapper lo traduce a `declined`.
      const intent = await this.withHardTimeout(
        this.stripe.paymentIntents.create(
          {
            amount,
            currency,
            payment_method: input.paymentToken,
            confirm: true,
            // Stripe rechaza la llamada si la cuenta tiene metodos de pago que
            // redirigen fuera del sitio: exige `return_url`. Declarando
            // `allow_redirects: 'never'` se limita la confirmacion a metodos que
            // no redirigen, que es lo que un authorize server-side necesita.
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          },
          {
            idempotencyKey: input.idempotencyKey,
            timeout: this.config.timeoutMs,
            maxNetworkRetries: this.config.maxNetworkRetries,
          },
        ),
        this.config.timeoutMs,
      );

      return this.mapIntentToResult(intent, 'authorize');
    } catch (error) {
      this.logger.warn(
        `authorize() falló para la clave de idempotencia ${input.idempotencyKey}: ${describeError(error)}`,
      );
      return mapStripeErrorToResult(error);
    }
  }

  /**
   * NO ejecuta una segunda operación monetaria. Stripe ya capturó en
   * `authorize()`; aquí solo se recupera el PaymentIntent confirmado y se
   * normaliza su estado.
   *
   * Consecuencia asumida: si la cuenta de Stripe habilitara captura manual
   * (`capture_method: manual`), este método no completaría la captura porque no
   * llama a `paymentIntents.capture()`. El adapter autoriza siempre con captura
   * automática, así que ese estado no se da.
   */
  async capture(input: CaptureInput): Promise<ProviderResult> {
    return this.retrieveIntent(input.providerTransactionId, 'capture');
  }

  /** Consulta real contra Stripe: `retrieve` del PaymentIntent. */
  async queryStatus(input: QueryStatusInput): Promise<ProviderResult> {
    return this.retrieveIntent(input.providerTransactionId, 'queryStatus');
  }

  private async retrieveIntent(providerTransactionId: string, operation: string): Promise<ProviderResult> {
    try {
      const intent = await this.withHardTimeout(
        this.stripe.paymentIntents.retrieve(providerTransactionId, undefined, {
          timeout: this.config.timeoutMs,
          maxNetworkRetries: this.config.maxNetworkRetries,
        }),
        this.config.timeoutMs,
      );

      return this.mapIntentToResult(intent, operation);
    } catch (error) {
      this.logger.warn(
        `${operation}() falló para ${providerTransactionId}: ${describeError(error)}`,
      );
      return mapStripeErrorToResult(error);
    }
  }

  /**
   * Reloj de pared: garantiza que la promesa se resuelva en `timeoutMs` aunque la
   * conexión siga activa. El timeout nativo del SDK ya está en las opciones de
   * cada request; esto es el techo que lo acompaña.
   */
  private async withHardTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new StripeRequestTimeoutError(timeoutMs)), timeoutMs);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      if (isTimeoutError(error)) {
        this.logger.warn(`Stripe no respondió dentro de ${timeoutMs} ms.`);
      }
      throw error;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private mapIntentToResult(intent: Stripe.PaymentIntent, operation: string): ProviderResult {
    const result = mapPaymentIntentToResult(intent);
    if (result.errorCode === AdapterErrorCode.PROCESSING_ERROR) {
      this.logger.warn(
        `${operation}() recibió un estado de Stripe no esperado: ${intent.status} (paymentIntent=${intent.id}).`,
      );
    }
    return result;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) {
    return `${error.name} (${error.code ?? error.type}): ${error.message}`;
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}