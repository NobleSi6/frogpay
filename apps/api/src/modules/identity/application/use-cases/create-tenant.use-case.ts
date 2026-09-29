import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreateTenantDto } from '../dto/create-tenant.dto';
import { TenantResponseDto } from '../dto/tenant-response.dto';
import {
  ITenantRepository,
  TENANT_REPOSITORY,
} from '../../domain/repositories/tenant.repository.interface';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { EVENT_BUS, IEventBus } from '../../../../shared/events/event-bus.interface';
import { Tenant } from '../../domain/entities/tenant.entity';
import { User } from '../../domain/entities/user.entity';
import { ApiKey } from '../../domain/entities/api-key.entity';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import { TenantCreatedEvent } from '../../domain/events/tenant-created.event';
import { EMAIL_SENDER, EmailSender } from '../../../../shared/email/email-sender.interface';
import {
  TENANT_REGISTRATION_REPOSITORY,
  TenantRegistrationRepository,
} from '../ports/tenant-registration.repository';

@Injectable()
export class CreateTenantUseCase {
  private readonly logger = new Logger(CreateTenantUseCase.name);

  constructor(
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepository: ITenantRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(TENANT_REGISTRATION_REPOSITORY)
    private readonly registrationRepository: TenantRegistrationRepository,
    @Inject(EVENT_BUS)
    private readonly eventBus: IEventBus,
    @Inject(EMAIL_SENDER)
    private readonly emailSender: EmailSender,
  ) {}

  async execute(dto: CreateTenantDto): Promise<TenantResponseDto> {
    this.logger.log(`Iniciando registro de nuevo tenant: '${dto.name}' (NIT: ${dto.taxId})`);

    // 1. Verificación de unicidad del NIT / Tax ID
    const existingTaxId = await this.tenantRepository.findByTaxId(dto.taxId);
    if (existingTaxId) {
      throw new ConflictException(
        `Ya existe una empresa registrada con el NIT/Identificación: ${dto.taxId}`,
      );
    }

    // 2. Verificación de unicidad del nombre comercial
    const existingName = await this.tenantRepository.findByName(dto.name);
    if (existingName) {
      throw new ConflictException(
        `Ya existe una empresa registrada con el nombre: ${dto.name}`,
      );
    }

    // 3. Verificación de unicidad del correo electrónico del propietario
    const existingEmail = await this.userRepository.findByEmail(dto.contactEmail);
    if (existingEmail) {
      throw new ConflictException(
        `Ya existe un usuario registrado con el correo: ${dto.contactEmail}`,
      );
    }

    // 4. Creación de la Entidad Tenant
    const tenant = Tenant.create({
      name: dto.name,
      taxId: dto.taxId,
      contactEmail: dto.contactEmail,
      plan: dto.plan,
      webhookUrl: dto.webhookUrl,
      metadata: dto.metadata,
    });

    // 5. Creación del Usuario Propietario (HU-01B: Estado 'invited' con Token criptográfico de 72h)
    const invitationToken = CryptoUtil.generateSecureToken(32);
    const ownerUser = User.createInvitedOwner(
      tenant.id,
      dto.contactEmail,
      CryptoUtil.hashString(invitationToken),
      72,
    );

    // 6. Generación de API Keys iniciales (Test y Live con hashing SHA-256)
    const testKeyGen = CryptoUtil.generateApiKey('test');
    const liveKeyGen = CryptoUtil.generateApiKey('live');

    const testApiKey = ApiKey.create({
      tenantId: tenant.id,
      name: 'Default Test API Key',
      type: 'test',
      keyPrefix: testKeyGen.keyPrefix,
      keyHash: testKeyGen.keyHash,
      maskedKey: testKeyGen.maskedKey,
    });

    const liveApiKey = ApiKey.create({
      tenantId: tenant.id,
      name: 'Default Live API Key',
      type: 'live',
      keyPrefix: liveKeyGen.keyPrefix,
      keyHash: liveKeyGen.keyHash,
      maskedKey: liveKeyGen.maskedKey,
    });

    // 7. Persistencia atómica del tenant, owner y sus llaves iniciales
    try {
      await this.registrationRepository.save(tenant, ownerUser, [testApiKey, liveApiKey]);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Ya existe una empresa o usuario con los datos proporcionados.');
      }
      throw error;
    }

    // 8. Emisión del Evento de Dominio (EDA: tenant.creado)
    const domainEvent = new TenantCreatedEvent({
      tenantId: tenant.id,
      name: tenant.name,
      taxId: tenant.taxId.value,
      contactEmail: tenant.contactEmail.value,
      plan: tenant.plan,
      status: tenant.status,
      owner: {
        userId: ownerUser.id,
        email: ownerUser.email.value,
        role: ownerUser.role,
        status: ownerUser.status,
        invitationExpiresAt: ownerUser.invitationExpiresAt!,
      },
      apiKeys: [
        {
          apiKeyId: testApiKey.id,
          type: testApiKey.type,
          keyPrefix: testApiKey.keyPrefix,
          maskedKey: testApiKey.maskedKey,
        },
        {
          apiKeyId: liveApiKey.id,
          type: liveApiKey.type,
          keyPrefix: liveApiKey.keyPrefix,
          maskedKey: liveApiKey.maskedKey,
        },
      ],
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const invitationUrl = new URL('/activate', frontendUrl);
    invitationUrl.searchParams.set('email', ownerUser.email.value);
    invitationUrl.searchParams.set('token', invitationToken);
    await this.emailSender.sendInvitation({
      to: ownerUser.email.value,
      tenantName: tenant.name,
      invitationUrl: invitationUrl.toString(),
      expiresAt: ownerUser.invitationExpiresAt!,
    });

    await this.eventBus.publish(domainEvent);
    this.logger.log(`Tenant '${tenant.name}' creado exitosamente (ID: ${tenant.id})`);

    // 9. Construcción y retorno de respuesta (incluyendo llaves en texto plano solo en esta respuesta única)
    return {
      id: tenant.id,
      name: tenant.name,
      taxId: tenant.taxId.value,
      contactEmail: tenant.contactEmail.value,
      plan: tenant.plan,
      status: tenant.status,
      webhookUrl: tenant.webhookUrl,
      metadata: tenant.metadata,
      owner: {
        userId: ownerUser.id,
        email: ownerUser.email.value,
        role: ownerUser.role,
        status: ownerUser.status,
        invitationExpiresAt: ownerUser.invitationExpiresAt!,
      },
      invitationSent: true,
      apiKeys: [
        {
          type: 'test',
          rawKey: testKeyGen.rawKey,
          keyPrefix: testKeyGen.keyPrefix,
          maskedKey: testKeyGen.maskedKey,
        },
        {
          type: 'live',
          rawKey: liveKeyGen.rawKey,
          keyPrefix: liveKeyGen.keyPrefix,
          maskedKey: liveKeyGen.maskedKey,
        },
      ],
      createdAt: tenant.createdAt,
    };
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2002';
}
