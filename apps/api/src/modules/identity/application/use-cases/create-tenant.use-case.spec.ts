import { ConflictException } from '@nestjs/common';
import { CreateTenantUseCase } from './create-tenant.use-case';
import { ITenantRepository } from '../../domain/repositories/tenant.repository.interface';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { IApiKeyRepository } from '../../domain/repositories/api-key.repository.interface';
import { IEventBus } from '../../../../shared/events/event-bus.interface';
import { CreateTenantDto, TenantPlanDto } from '../dto/create-tenant.dto';
import { Tenant } from '../../domain/entities/tenant.entity';
import { User } from '../../domain/entities/user.entity';

describe('CreateTenantUseCase', () => {
  let useCase: CreateTenantUseCase;
  let tenantRepo: jest.Mocked<ITenantRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let apiKeyRepo: jest.Mocked<IApiKeyRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let emailSender: { sendInvitation: jest.Mock };

  const validDto: CreateTenantDto = {
    name: 'Acme Bolivia S.R.L.',
    taxId: '1029384021',
    contactEmail: 'gerencia@acme.bo',
    plan: TenantPlanDto.STARTER,
    webhookUrl: 'https://acme.bo/webhooks',
    metadata: { city: 'La Paz' },
  };

  beforeEach(() => {
    tenantRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByTaxId: jest.fn().mockResolvedValue(null),
      findByName: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    userRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByInvitationTokenHash: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };

    apiKeyRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByTenantId: jest.fn().mockResolvedValue([]),
      findByKeyHash: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
      saveMany: jest.fn().mockResolvedValue(undefined),
    };

    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishAll: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(),
    };

    emailSender = { sendInvitation: jest.fn().mockResolvedValue(undefined) };

    useCase = new CreateTenantUseCase(tenantRepo, userRepo, apiKeyRepo, eventBus, emailSender);
  });

  it('debe registrar un tenant exitosamente con su owner invitado, API Keys y evento de dominio', async () => {
    const result = await useCase.execute(validDto);

    // Verificaciones del Tenant
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe(validDto.name);
    expect(result.taxId).toBe(validDto.taxId);
    expect(result.contactEmail).toBe(validDto.contactEmail);
    expect(result.plan).toBe('starter');
    expect(result.status).toBe('active');

    // Verificaciones del Owner
    expect(result.owner).toBeDefined();
    expect(result.owner.email).toBe(validDto.contactEmail);
    expect(result.owner.role).toBe('OWNER');
    expect(result.owner.status).toBe('invited');
    expect(result.invitationSent).toBe(true);
    expect(emailSender.sendInvitation).toHaveBeenCalledTimes(1);
    const invitationEmail = emailSender.sendInvitation.mock.calls[0][0];
    expect(invitationEmail.to).toBe(validDto.contactEmail);
    expect(invitationEmail.invitationUrl).toContain('token=');
    expect(JSON.stringify(result)).not.toContain(new URL(invitationEmail.invitationUrl).searchParams.get('token'));

    // Verificaciones de API Keys
    expect(result.apiKeys).toHaveLength(2);
    const testKey = result.apiKeys.find((k) => k.type === 'test');
    const liveKey = result.apiKeys.find((k) => k.type === 'live');

    expect(testKey).toBeDefined();
    expect(testKey?.rawKey).toMatch(/^fp_test_/);
    expect(testKey?.maskedKey).toContain('fp_test_');

    expect(liveKey).toBeDefined();
    expect(liveKey?.rawKey).toMatch(/^fp_live_/);
    expect(liveKey?.maskedKey).toContain('fp_live_');

    // Verificación de llamadas a persistencia
    expect(tenantRepo.save).toHaveBeenCalledTimes(1);
    expect(userRepo.save).toHaveBeenCalledTimes(1);
    expect(apiKeyRepo.saveMany).toHaveBeenCalledTimes(1);

    // Verificación de publicación del evento EDA (tenant.creado)
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const publishedEvent = eventBus.publish.mock.calls[0][0];
    expect(publishedEvent.eventName).toBe('tenant.creado');
    expect(publishedEvent.aggregateId).toBe(result.id);
  });

  it('debe lanzar ConflictException si el NIT / Tax ID ya está registrado', async () => {
    tenantRepo.findByTaxId.mockResolvedValueOnce(
      Tenant.create({
        name: 'Otro Comercio',
        taxId: validDto.taxId,
        contactEmail: 'otro@comercio.bo',
      }),
    );

    await expect(useCase.execute(validDto)).rejects.toThrow(ConflictException);
    expect(tenantRepo.save).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('debe lanzar ConflictException si el nombre de la empresa ya está registrado', async () => {
    tenantRepo.findByName.mockResolvedValueOnce(
      Tenant.create({
        name: validDto.name,
        taxId: '9988776655',
        contactEmail: 'otro@comercio.bo',
      }),
    );

    await expect(useCase.execute(validDto)).rejects.toThrow(ConflictException);
    expect(tenantRepo.save).not.toHaveBeenCalled();
  });

  it('debe lanzar ConflictException si el correo del contacto ya está registrado', async () => {
    userRepo.findByEmail.mockResolvedValueOnce(
      User.createInvitedOwner('t-123', validDto.contactEmail, 'token-123'),
    );

    await expect(useCase.execute(validDto)).rejects.toThrow(ConflictException);
    expect(tenantRepo.save).not.toHaveBeenCalled();
  });

  it('debe lanzar error de dominio si el formato del correo es inválido', async () => {
    const invalidEmailDto = { ...validDto, contactEmail: 'correo-invalido' };
    await expect(useCase.execute(invalidEmailDto)).rejects.toThrow(
      /formato del correo electrónico es inválido/,
    );
  });

  it('debe lanzar error de dominio si el NIT es demasiado corto', async () => {
    const invalidTaxIdDto = { ...validDto, taxId: '123' };
    await expect(useCase.execute(invalidTaxIdDto)).rejects.toThrow(/NIT o documento tributario/);
  });
});
