/**
 * `stripe` declara `export = StripeConstructor` y su `module.exports` es el
 * propio constructor, sin `.default`. Como el proyecto no activa
 * `esModuleInterop`, un import por defecto resolvería `undefined` en runtime;
 * por eso se importa el módulo entero.
 */
import * as Stripe from 'stripe';
import { STRIPE_PROVIDER_CONFIG, StripeProviderConfig } from './stripe-provider.config';

/**
 * Frontera de encapsulamiento del SDK (DEV3-203): `stripe` solo se importa
 * dentro de `adapters/stripe/`. Este archivo es el único que *construye* el
 * cliente; el resto de la carpeta lo recibe inyectado y solo lo usa para leer
 * tipos y errores. Ningún otro módulo del proyecto importa `stripe`.
 */
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const STRIPE_ADAPTER_CODE = 'stripe';

export function createStripeClient(config: StripeProviderConfig): Stripe {
  return new Stripe(config.secretKey, {
    // Tope por request. El adapter lo repite en cada llamada para que el valor no
    // dependa solo de la configuración del cliente.
    timeout: config.timeoutMs,
    // Sin reintentos: el timeout debe ser el techo real de la llamada.
    maxNetworkRetries: config.maxNetworkRetries,
    appInfo: {
      name: 'FrogPay',
      version: '0.1.0',
    },
    ...(config.host ? { host: config.host } : {}),
    ...(config.port ? { port: config.port } : {}),
    ...(config.protocol ? { protocol: config.protocol } : {}),
  });
}

export const stripeClientProvider = {
  provide: STRIPE_CLIENT,
  inject: [STRIPE_PROVIDER_CONFIG],
  useFactory: (config: StripeProviderConfig): Stripe => createStripeClient(config),
};