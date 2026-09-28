import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  API_KEY_REPOSITORY,
  IApiKeyRepository,
} from '../../domain/repositories/api-key.repository.interface';
import {
  ITenantRepository,
  TENANT_REPOSITORY,
} from '../../domain/repositories/tenant.repository.interface';
import { ApiKeyResponseDto } from '../dto/api-key-response.dto';

@Injectable()
export class ListApiKeysUseCase {
  private readonly logger = new Logger(ListApiKeysUseCase.name);

  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepository: IApiKeyRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepository: ITenantRepository,
  ) {}

  async execute(tenantId: string): Promise<ApiKeyResponseDto[]> {
    this.logger.log(`Listando API Keys del tenant ${tenantId}`);

    // 1. Verificar que el tenant existe
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`No se encontró el tenant con ID: ${tenantId}`);
    }

    // 2. Obtener todas las llaves del tenant
    const apiKeys = await this.apiKeyRepository.findByTenantId(tenantId);

    this.logger.log(
      `Se encontraron ${apiKeys.length} API Key(s) para el tenant ${tenantId}`,
    );

    // 3. Mapear a DTOs de respuesta (nunca exponer hashes ni llaves reales)
    return apiKeys.map((key) => ({
      id: key.id,
      tenantId: key.tenantId,
      name: key.name,
      type: key.type,
      keyPrefix: key.keyPrefix,
      maskedKey: key.maskedKey,
      isActive: key.isActive,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));
  }
}
