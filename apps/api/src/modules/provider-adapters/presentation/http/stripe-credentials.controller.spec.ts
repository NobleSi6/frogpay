import { Test, TestingModule } from '@nestjs/testing';
import { StripeCredentialsController } from './stripe-credentials.controller';
import { StripeCredentialsService } from '../../application/stripe-credentials.service';
import type { AuthenticatedTenantContext } from '../../../../shared/auth/current-tenant.decorator';
import { StripeCredentialsDto } from '../dto/stripe-credentials.dto';

describe('StripeCredentialsController', () => {
  let controller: StripeCredentialsController;
  let service: jest.Mocked<Partial<StripeCredentialsService>>;

  const mockContext: AuthenticatedTenantContext = {
    userId: 'user-123',
    email: 'owner@tenant.com',
    role: 'OWNER',
    tenantId: 'tenant-456',
  };

  beforeEach(async () => {
    service = {
      get: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeCredentialsController],
      providers: [
        {
          provide: StripeCredentialsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<StripeCredentialsController>(StripeCredentialsController);
  });

  it('delegates getCredentials to service with tenantId and role from context', async () => {
    const expectedResponse = {
      environment: 'sandbox' as const,
      configured: true,
      publishableKey: 'pk_test_123',
      secretKeyMasked: 'sk_test_...1234',
    };
    (service.get as jest.Mock).mockResolvedValue(expectedResponse);

    const result = await controller.getCredentials(mockContext, 'sandbox');

    expect(service.get).toHaveBeenCalledWith('tenant-456', 'OWNER', 'sandbox');
    expect(result).toEqual(expectedResponse);
  });

  it('delegates saveCredentials to service with body, tenantId and role from context', async () => {
    const body: StripeCredentialsDto = {
      publishableKey: 'pk_test_123',
      secretKey: 'sk_test_secret1234',
    };
    const expectedResponse = {
      environment: 'sandbox' as const,
      configured: true,
      publishableKey: 'pk_test_123',
      secretKeyMasked: 'sk_test_...1234',
    };
    (service.save as jest.Mock).mockResolvedValue(expectedResponse);

    const result = await controller.saveCredentials(mockContext, 'sandbox', body);

    expect(service.save).toHaveBeenCalledWith('tenant-456', 'OWNER', 'sandbox', body);
    expect(result).toEqual(expectedResponse);
  });
});
