import { PaymentProviderPort, ProviderResult } from '../ports/payment-provider.port';
import {
  DEFAULT_PAYMENT_PROVIDER_BINDINGS,
  DuplicatePaymentProviderBindingError,
  InvalidPaymentProviderBindingsError,
  MissingPaymentProviderBindingError,
  parsePaymentProviderBindings,
  UnsupportedPaymentMethodError,
  UnsupportedPaymentProviderBindingError,
} from './payment-provider.binding';
import { PaymentProviderRegistry } from './payment-provider.registry';

function fakeAdapter(id: string, methods: string[]): PaymentProviderPort {
  return {
    metadata: {
      id,
      displayName: id,
      methods: methods.map((code) => ({
        code,
        label: code,
        processingMode: 'synchronous',
        requiresPaymentToken: code === 'card',
        fees: { fixedAmount: '0.00', variableBps: 0, currency: 'USD' },
      })),
    },
    authorize: async (): Promise<ProviderResult> => ({
      outcome: 'approved',
      providerTransactionId: id,
    }),
    capture: async (): Promise<ProviderResult> => ({
      outcome: 'approved',
      providerTransactionId: id,
    }),
    queryStatus: async (): Promise<ProviderResult> => ({
      outcome: 'approved',
      providerTransactionId: id,
    }),
  };
}

const stripe = fakeAdapter('stripe', ['card']);
const azzurra = fakeAdapter('azzurra', ['wallet', 'card']);

describe('PaymentProviderRegistry', () => {
  it('resolves methods from adapter metadata', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      [{ paymentMethod: 'card', adapterCode: 'stripe' }],
    );

    expect(registry.resolve('card')).toBe(stripe);
    expect(registry.resolve('wallet')).toBe(azzurra);
    expect(registry.supportedPaymentMethods()).toEqual(['card', 'wallet']);
    expect(registry.supportedAdapterCodes()).toEqual(['azzurra', 'stripe']);
  });

  it('normalizes method codes for resolve, supports, and capabilityOf', () => {
    const registry = new PaymentProviderRegistry(
      [{ adapterCode: 'stripe', adapter: stripe }],
      DEFAULT_PAYMENT_PROVIDER_BINDINGS,
    );

    expect(registry.resolve(' CARD ')).toBe(stripe);
    expect(registry.supports('CARD')).toBe(true);
    expect(registry.capabilityOf(' card ').code).toBe('card');
  });

  it('lists each enabled capability with its provider id', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      [{ paymentMethod: 'card', adapterCode: 'stripe' }],
    );

    expect(registry.listMethods()).toEqual([
      {
        code: 'card',
        label: 'card',
        processingMode: 'synchronous',
        requiresPaymentToken: true,
        fees: { fixedAmount: '0.00', variableBps: 0, currency: 'USD' },
        providerId: 'stripe',
      },
      {
        code: 'wallet',
        label: 'wallet',
        processingMode: 'synchronous',
        requiresPaymentToken: false,
        fees: { fixedAmount: '0.00', variableBps: 0, currency: 'USD' },
        providerId: 'azzurra',
      },
    ]);
  });

  it('throws UnsupportedPaymentMethodError for unknown methods', () => {
    const registry = new PaymentProviderRegistry(
      [{ adapterCode: 'stripe', adapter: stripe }],
      DEFAULT_PAYMENT_PROVIDER_BINDINGS,
    );

    expect(registry.supports('qr')).toBe(false);
    expect(() => registry.resolve('qr')).toThrow(UnsupportedPaymentMethodError);
    expect(() => registry.capabilityOf('qr')).toThrow(UnsupportedPaymentMethodError);
  });

  it('fails fast if adapters collide and no explicit binding selects one', () => {
    expect(
      () =>
        new PaymentProviderRegistry(
          [
            { adapterCode: 'stripe', adapter: stripe },
            { adapterCode: 'azzurra', adapter: azzurra },
          ],
          [{ paymentMethod: 'wallet', adapterCode: 'azzurra' }],
        ),
    ).toThrow(DuplicatePaymentProviderBindingError);
  });

  it('uses an explicit binding to resolve a metadata collision', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      [{ paymentMethod: 'card', adapterCode: 'azzurra' }],
    );

    expect(registry.resolve('card')).toBe(azzurra);
  });

  it('rejects bindings to an adapter that is not registered', () => {
    expect(
      () =>
        new PaymentProviderRegistry([{ adapterCode: 'stripe', adapter: stripe }], [
          { paymentMethod: 'card', adapterCode: 'missing' },
        ]),
    ).toThrow(MissingPaymentProviderBindingError);
  });

  it('rejects a binding when the selected adapter does not declare that method', () => {
    expect(
      () =>
        new PaymentProviderRegistry([{ adapterCode: 'stripe', adapter: stripe }], [
          { paymentMethod: 'wallet', adapterCode: 'stripe' },
        ]),
    ).toThrow(UnsupportedPaymentProviderBindingError);
  });

  it('rejects adapter registration ids that disagree with metadata', () => {
    expect(
      () =>
        new PaymentProviderRegistry(
          [{ adapterCode: 'another-id', adapter: stripe }],
          DEFAULT_PAYMENT_PROVIDER_BINDINGS,
        ),
    ).toThrow(InvalidPaymentProviderBindingsError);
  });

  it('allows explicit reconfiguration for methods supported by both adapters', () => {
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

  it('replace=true discards previously enabled methods', () => {
    const registry = new PaymentProviderRegistry(
      [
        { adapterCode: 'stripe', adapter: stripe },
        { adapterCode: 'azzurra', adapter: azzurra },
      ],
      [{ paymentMethod: 'card', adapterCode: 'stripe' }],
    );

    registry.applyBindings([{ paymentMethod: 'wallet', adapterCode: 'azzurra' }], true);

    expect(registry.supportedPaymentMethods()).toEqual(['wallet']);
    expect(() => registry.resolve('card')).toThrow(UnsupportedPaymentMethodError);
  });
});

describe('DEFAULT_PAYMENT_PROVIDER_BINDINGS', () => {
  it('preserves card=stripe as the default override', () => {
    expect(DEFAULT_PAYMENT_PROVIDER_BINDINGS).toEqual([{ paymentMethod: 'card', adapterCode: 'stripe' }]);
  });
});

describe('parsePaymentProviderBindings', () => {
  it('parses comma-separated method=adapter entries', () => {
    expect(parsePaymentProviderBindings('card=stripe,wallet=azzurra')).toEqual([
      { paymentMethod: 'card', adapterCode: 'stripe' },
      { paymentMethod: 'wallet', adapterCode: 'azzurra' },
    ]);
  });

  it('trims whitespace around bindings', () => {
    expect(parsePaymentProviderBindings(' card = stripe , wallet = azzurra ')).toEqual([
      { paymentMethod: 'card', adapterCode: 'stripe' },
      { paymentMethod: 'wallet', adapterCode: 'azzurra' },
    ]);
  });

  it('rejects malformed and empty bindings', () => {
    expect(() => parsePaymentProviderBindings('')).toThrow(InvalidPaymentProviderBindingsError);
    expect(() => parsePaymentProviderBindings('card')).toThrow('no tiene el formato metodo=adaptador');
    expect(() => parsePaymentProviderBindings('=stripe')).toThrow(InvalidPaymentProviderBindingsError);
    expect(() => parsePaymentProviderBindings('card=')).toThrow(InvalidPaymentProviderBindingsError);
  });
});
