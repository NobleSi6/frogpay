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
import { ApiKeyResponseDto } from '../dto/api-key-response.dto';

@Injectable()
export class RevokeApiKeyUseCase {
  private readonly logger = new Logger(RevokeApiKeyUseCase.name);

  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepository: IApiKeyRepository,
  ) {}

  async execute(tenantId: string, apiKeyId: string): Promise<ApiKeyResponseDto> {
    this.logger.log(`Revocando API Key ${apiKeyId} del tenant ${tenantId}`);

    // 1. Buscar la API Key
    const apiKey = await this.apiKeyRepository.findById(apiKeyId);

    if (!apiKey || apiKey.tenantId !== tenantId) {
      throw new NotFoundException(
        `No se encontró la API Key con ID: ${apiKeyId} para el tenant: ${tenantId}`,
      );
    }

    if (!apiKey.isActive) {
      this.logger.warn(`La API Key ${apiKeyId} ya estaba revocada`);
      return this.toDto(apiKey);
    }

    // 2. Revocar (marca isActive = false)
    apiKey.revoke();

    // 3. Persistir
    await this.apiKeyRepository.save(apiKey);

    this.logger.log(`API Key ${apiKeyId} revocada exitosamente`);

    return this.toDto(apiKey);
  }

  private toDto(apiKey: {
    id: string;
    tenantId: string;
    name: string;
    type: 'test' | 'live';
    keyPrefix: string;
    maskedKey: string;
    isActive: boolean;
    expiresAt?: Date;
    lastUsedAt?: Date;
    createdAt: Date;
  }): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      tenantId: apiKey.tenantId,
      name: apiKey.name,
      type: apiKey.type,
      keyPrefix: apiKey.keyPrefix,
      maskedKey: apiKey.maskedKey,
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    };
  }
}
