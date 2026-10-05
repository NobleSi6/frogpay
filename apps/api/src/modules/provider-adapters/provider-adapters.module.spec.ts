import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../shared/database/prisma.module';
import { StripePaymentProviderAdapter } from './adapters/stripe/stripe-payment-provider.adapter';
import { PAYMENT_PROVIDER_PORT } from './ports/payment-provider.port';
import { ProviderAdaptersModule } from './provider-adapters.module';

describe('ProviderAdaptersModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              STRIPE_SECRET_KEY: 'sk_test_provider_module',
              DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
            }),
          ],
        }),
        PrismaModule,
        ProviderAdaptersModule,
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('exports PAYMENT_PROVIDER_PORT as the Stripe adapter implementation', () => {
    expect(moduleRef.get(PAYMENT_PROVIDER_PORT, { strict: false })).toBe(
      moduleRef.get(StripePaymentProviderAdapter, { strict: false }),
    );
  });
});
