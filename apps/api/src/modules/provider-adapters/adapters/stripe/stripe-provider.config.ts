/**
 * Configuración del adaptador de Stripe.
 *
 * Sprint 3 (DEV3-203): un único secreto compartido para todos los tenants. Cuando
 * exista el credencial por tenant (`tenant_provider_credential`), esta clase
 * deja de ser la fuente y pasa a ser solo el valor por defecto del sandbox.
 */
export const STRIPE_PROVIDER_CONFIG = Symbol('STRIPE_PROVIDER_CONFIG');

/**
 * Presupuesto duro de la llamada a Stripe. El SDK lo aplica por request como
 * timeout nativo; el adapter lo refuerza con un reloj de pared.
 */
export const DEFAULT_STRIPE_TIMEOUT_MS = 3000;

export interface StripeProviderConfig {
  readonly secretKey: string;
  readonly timeoutMs: number;
  /**
   * El SDK reintenta 2 veces por defecto. Con reintentos, un timeout de 3000 ms
   * por intento puede tardar 9000 ms en total. Se fija en 0 para que el timeout
   * sea el techo real de la llamada.
   */
  readonly maxNetworkRetries: number;
  /** Host de la API de Stripe. Solo para pruebas (servidor local) o stripe-mock. */
  readonly host?: string;
  readonly port?: string | number;
  readonly protocol?: 'http' | 'https';
}

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = StripeConfigurationError.name;
  }
}

export const STRIPE_SECRET_KEY_PATTERN = /^(sk|rk)_[A-Za-z0-9_]+$/;

/**
 * Valida y normaliza la configuración leída del entorno. Lanza al arrancar si
 * falta la clave, igual que hace `validateEnvironment` con `DATABASE_URL`.
 */
export function resolveStripeProviderConfig(
  env: Record<string, string | undefined>,
): StripeProviderConfig {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new StripeConfigurationError(
      'STRIPE_SECRET_KEY es obligatoria para iniciar el adaptador de Stripe.',
    );
  }
  if (!STRIPE_SECRET_KEY_PATTERN.test(secretKey)) {
    throw new StripeConfigurationError(
      'STRIPE_SECRET_KEY tiene un formato inválido: debe empezar por sk_ o rk_ (sandbox: sk_test_...).',
    );
  }

  const timeoutMs = parsePositiveInteger(env.STRIPE_TIMEOUT_MS, DEFAULT_STRIPE_TIMEOUT_MS, 'STRIPE_TIMEOUT_MS');
  const maxNetworkRetries = parseNonNegativeInteger(env.STRIPE_MAX_NETWORK_RETRIES, 0, 'STRIPE_MAX_NETWORK_RETRIES');

  const host = env.STRIPE_API_HOST?.trim();
  const port = env.STRIPE_API_PORT?.trim();
  const protocol = env.STRIPE_API_PROTOCOL?.trim();

  return {
    secretKey,
    timeoutMs,
    maxNetworkRetries,
    ...(host ? { host } : {}),
    ...(port ? { port } : {}),
    ...(protocol === 'http' || protocol === 'https' ? { protocol } : {}),
  };
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new StripeConfigurationError(`${name} debe ser un entero mayor que cero.`);
  }
  return value;
}

function parseNonNegativeInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new StripeConfigurationError(`${name} debe ser un entero igual o mayor que cero.`);
  }
  return value;
}