import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { TenantsController } from './tenants.controller';
import { CreateTenantUseCase } from '../../application/use-cases/create-tenant.use-case';
import { CreateTenantDto, TenantPlanDto } from '../../application/dto/create-tenant.dto';
import { TenantResponseDto } from '../../application/dto/tenant-response.dto';
import { RolesGuard } from '../../../../shared/auth/roles.guard';

describe('TenantsController', () => {
  let controller: TenantsController;
  let useCase: jest.Mocked<CreateTenantUseCase>;

  const mockResponse: TenantResponseDto = {
    id: 'tenant-123',
    name: 'Banco Ganadero',
    taxId: '1020304050',
    contactEmail: 'contacto@ganadero.com.bo',
    plan: 'premium',
    status: 'active',
    owner: {
      userId: 'user-123',
      email: 'contacto@ganadero.com.bo',
      role: 'OWNER',
      status: 'invited',
      invitationExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    },
    invitationSent: true,
    apiKeys: [
      {
        type: 'test',
        rawKey: 'fp_test_123',
        keyPrefix: 'fp_test_123',
        maskedKey: 'fp_test_123...123',
      },
      {
        type: 'live',
        rawKey: 'fp_live_456',
        keyPrefix: 'fp_live_456',
        maskedKey: 'fp_live_456...456',
      },
    ],
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockUseCase = {
      execute: jest.fn().mockResolvedValue(mockResponse),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        {
          provide: CreateTenantUseCase,
          useValue: mockUseCase,
        },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
    useCase = module.get(CreateTenantUseCase);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe invocar a CreateTenantUseCase y retornar la respuesta completa', async () => {
    const dto: CreateTenantDto = {
      name: 'Banco Ganadero',
      taxId: '1020304050',
      contactEmail: 'contacto@ganadero.com.bo',
      plan: TenantPlanDto.PREMIUM,
    };

    const result = await controller.createTenant(dto);

    expect(useCase.execute).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockResponse);
  });
});
