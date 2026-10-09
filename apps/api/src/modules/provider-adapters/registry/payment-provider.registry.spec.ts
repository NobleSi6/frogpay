import { PaymentProviderPort, ProviderResult } from '../ports/payment-provider.port';
import {
  DEFAULT_PAYMENT_PROVIDER_BINDINGS,
  DuplicatePaymentProviderBindingError,
  InvalidPaymentProviderBindingsError,
  MissingPaymentProviderBindingError,
  parsePaymentProviderBindings,
  UnsupportedPaymentMethodError,
} from './payment-provider.binding';
import { PaymentProviderRegistry } from './payment-provider.registry';

function fakeAdapter(name: string): PaymentProviderPort {
  return {
    metadata: {
      id: name,
      displayName: name,
      methods: [
        {
          code: name === 'stripe' ? 'card' : 'wallet',
          label: name,
          processingMode: 'synchronous',
          requiresPaymentToken: false,
          fees: { fixedAmount: '0.00', variableBps: 0, currency: 'USD' },
        },
      ],
    },
    authorize: async (): Promise<ProviderResult> => ({ outcome: 'approved', providerTransactionId: name }),
    capture: async (): Promise<ProviderResult> => ({ outcome: 'approved', providerTransactionId: name }),
    queryStatus: async (): Promise<ProviderResult> => ({ outcome: 'approved', providerTransactionId: name }),
  };
}

const stripe = fakeAdapter('stripe');
const azzurra = fakeAdapter('azzurra');

describe('PaymentProviderRegistry', () => {
  it('resuelve el adaptador del método de pago sin condiciones por proveedor', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      [
        { paymentMethod: 'card', adapterCode: 'stripe' },
        { paymentMethod: 'wallet', adapterCode: 'azzurra' },
      ],
    );

    expect(registry.resolve('card')).toBe(stripe);
    expect(registry.resolve('wallet')).toBe(azzurra);
    expect(registry.supportedPaymentMethods()).toEqual(['card', 'wallet']);
    expect(registry.supportedAdapterCodes()).toEqual(['azzurra', 'stripe']);
  });

  it('normaliza mayúsculas y espacios del método de pago', () => {
    const registry = new PaymentProviderRegistry([{ adapterCode: 'stripe', adapter: stripe }], [
      { paymentMethod: 'card', adapterCode: 'stripe' },
    ]);

    expect(registry.resolve('CARD')).toBe(stripe);
    expect(registry.resolve(' card ')).toBe(stripe);
  });

  it('lanza un error explícito cuando el método de pago no tiene adaptador', () => {
    const registry = new PaymentProviderRegistry([{ adapterCode: 'stripe', adapter: stripe }], [
      { paymentMethod: 'card', adapterCode: 'stripe' },
    ]);

    expect(() => registry.resolve('qr')).toThrow(UnsupportedPaymentMethodError);
    expect(() => registry.resolve('qr')).toThrow('No hay un adaptador de proveedor registrado');
  });

  it('rechaza enlazar dos adaptadores al mismo método de pago', () => {
    expect(
      () =>
        new PaymentProviderRegistry(
          [
            { adapterCode: 'stripe', adapter: stripe },
            { adapterCode: 'azzurra', adapter: azzurra },
          ],
          [
            { paymentMethod: 'card', adapterCode: 'stripe' },
            { paymentMethod: 'CARD', adapterCode: 'azzurra' },
          ],
        ),
    ).toThrow(DuplicatePaymentProviderBindingError);
  });

  it('rechaza enlazar un adaptador que no está registrado', () => {
    expect(
      () =>
        new PaymentProviderRegistry([{ adapterCode: 'stripe', adapter: stripe }], [
          { paymentMethod: 'card', adapterCode: 'azzurra' },
        ]),
    ).toThrow(MissingPaymentProviderBindingError);
  });

  it('permite reconfigurar el mapeo por configuración sin cambiar el código', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      DEFAULT_PAYMENT_PROVIDER_BINDINGS,
    );

    expect(registry.resolve('card')).toBe(stripe);

    registry.applyBindings([{ paymentMethod: 'card', adapterCode: 'azzurra' }]);

    expect(registry.resolve('card')).toBe(azzurra);
  });

  it('replace=true descarta los bindings anteriores', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      [{ paymentMethod: 'wallet', adapterCode: 'azzurra' }],
    );

    registry.applyBindings([{ paymentMethod: 'card', adapterCode: 'stripe' }], true);

    expect(registry.supportedPaymentMethods()).toEqual(['card']);
    expect(() => registry.resolve('wallet')).toThrow(UnsupportedPaymentMethodError);
  });
});

describe('DEFAULT_PAYMENT_PROVIDER_BINDINGS', () => {
  it('enlaza el método card con stripe', () => {
    expect(DEFAULT_PAYMENT_PROVIDER_BINDINGS).toEqual([{ paymentMethod: 'card', adapterCode: 'stripe' }]);
  });
});

describe('parsePaymentProviderBindings', () => {
  it('lee metodo=adaptador separados por comas', () => {
    expect(parsePaymentProviderBindings('card=stripe,wallet=azzurra')).toEqual([
      { paymentMethod: 'card', adapterCode: 'stripe' },
      { paymentMethod: 'wallet', adapterCode: 'azzurra' },
    ]);
  });

  it('tolera espacios', () => {
    expect(parsePaymentProviderBindings(' card = stripe , wallet = azzurra ')).toEqual([
      { paymentMethod: 'card', adapterCode: 'stripe' },
      { paymentMethod: 'wallet', adapterCode: 'azzurra' },
    ]);
  });

  it('rechaza bindings mal formados o vacíos', () => {
    expect(() => parsePaymentProviderBindings('')).toThrow(InvalidPaymentProviderBindingsError);
    expect(() => parsePaymentProviderBindings('card')).toThrow('no tiene el formato metodo=adaptador');
    expect(() => parsePaymentProviderBindings('=stripe')).toThrow(InvalidPaymentProviderBindingsError);
    expect(() => parsePaymentProviderBindings('card=')).toThrow(InvalidPaymentProviderBindingsError);
  });
});