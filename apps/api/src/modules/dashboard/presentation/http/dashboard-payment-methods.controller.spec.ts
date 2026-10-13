import { ROLES_KEY } from '../../../../shared/auth/roles.decorator';
import { DashboardPaymentMethodsController } from './dashboard-payment-methods.controller';

describe('DashboardPaymentMethodsController', () => {
  it('returns enabled methods without exposing adapter ids or fee configuration', () => {
    const paymentProviders = {
      listMethods: jest.fn().mockReturnValue([
        {
          code: 'card',
          label: 'Tarjeta',
          processingMode: 'synchronous',
          requiresPaymentToken: true,
          fees: { fixedAmount: '0.30', variableBps: 290, currency: 'USD' },
          providerId: 'stripe',
        },
      ]),
    };
    const controller = new DashboardPaymentMethodsController(paymentProviders as never);

    expect(controller.getPaymentMethods()).toEqual([
      {
        code: 'card',
        label: 'Tarjeta',
        processingMode: 'synchronous',
        requiresPaymentToken: true,
      },
    ]);
    expect(paymentProviders.listMethods).toHaveBeenCalledTimes(1);
  });

  it('does not advertise mock-only methods when the mock adapter is absent', () => {
    const paymentProviders = {
      listMethods: jest.fn().mockReturnValue([
        {
          code: 'card',
          label: 'Tarjeta',
          processingMode: 'synchronous',
          requiresPaymentToken: true,
          fees: { fixedAmount: '0.30', variableBps: 290, currency: 'USD' },
          providerId: 'stripe',
        },
      ]),
    };
    const controller = new DashboardPaymentMethodsController(paymentProviders as never);

    expect(controller.getPaymentMethods().map(({ code }) => code)).toEqual(['card']);
  });

  it('returns methods supplied by the registry when the mock adapter is enabled', () => {
    const paymentProviders = {
      listMethods: jest.fn().mockReturnValue([
        {
          code: 'card',
          label: 'Tarjeta (simulada)',
          processingMode: 'synchronous',
          requiresPaymentToken: false,
          fees: { fixedAmount: '0.00', variableBps: 0, currency: 'BOB' },
          providerId: 'mock',
        },
      ]),
    };
    const controller = new DashboardPaymentMethodsController(paymentProviders as never);

    expect(controller.getPaymentMethods()).toEqual([
      {
        code: 'card',
        label: 'Tarjeta (simulada)',
        processingMode: 'synchronous',
        requiresPaymentToken: false,
      },
    ]);
  });

  it('restricts access to owners and admins', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DashboardPaymentMethodsController)).toEqual([
      'OWNER',
      'ADMIN',
    ]);
  });
});
