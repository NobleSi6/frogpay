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
import { ApiKey } from '../../domain/entities/api-key.entity';
import { CryptoUtil } from '../../../../shared/utils/crypto.util';
import { GenerateApiKeyDto } from '../dto/generate-api-key.dto';
import { GeneratedApiKeyResponseDto } from '../dto/api-key-response.dto';

@Injectable()
export class GenerateApiKeyUseCase {
  private readonly logger = new Logger(GenerateApiKeyUseCase.name);

  constructor(
    @Inject(API_KEY_REPOSITORY)
    private readonly apiKeyRepository: IApiKeyRepository,
    @Inject(TENANT_REPOSITORY)
    private readonly tenantRepository: ITenantRepository,
  ) {}

  async execute(tenantId: string, dto: GenerateApiKeyDto): Promise<GeneratedApiKeyResponseDto> {
    this.logger.log(`Generando nueva API Key '${dto.type}' para tenant ${tenantId}`);

    // 1. Verificar que el tenant existe
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`No se encontró el tenant con ID: ${tenantId}`);
    }

    // 2. Generar la llave criptográfica (RNF-05)
    const generated = CryptoUtil.generateApiKey(dto.type);

    // 3. Crear la entidad de dominio (solo almacena hash SHA-256, nunca la llave real)
    const apiKey = ApiKey.create({
      tenantId,
      name: dto.name,
      type: dto.type,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      maskedKey: generated.maskedKey,
      expiresAt: dto.expiresAt,
    });

    // 4. Persistir
    await this.apiKeyRepository.save(apiKey);

    this.logger.log(
      `API Key '${dto.type}' creada exitosamente (ID: ${apiKey.id}, Prefix: ${generated.keyPrefix})`,
    );

    // 5. Retornar la llave en texto plano (¡solo esta vez!)
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
      rawKey: generated.rawKey,
    };
  }
}
