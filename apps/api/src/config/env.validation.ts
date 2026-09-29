import { plainToInstance, Type } from 'class-transformer';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    validateSync,
} from 'class-validator';
import 'reflect-metadata';

class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'test', 'production'], {
    message: 'NODE_ENV debe ser development, test o production.',
  })
  NODE_ENV = 'development';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'PORT debe ser un número entero.' })
  @Min(1, { message: 'PORT debe ser mayor que cero.' })
  PORT = 4000;

  @IsString({ message: 'DATABASE_URL es obligatoria.' })
  @IsNotEmpty({ message: 'DATABASE_URL es obligatoria.' })
  DATABASE_URL!: string;

  @IsOptional()
  @IsString({ message: 'DIRECT_URL debe ser una cadena.' })
  @IsNotEmpty({ message: 'DIRECT_URL no puede estar vacía.' })
  DIRECT_URL?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'PRISMA_TX_TIMEOUT_MS debe ser un entero.' })
  @Min(1, { message: 'PRISMA_TX_TIMEOUT_MS debe ser mayor que cero.' })
  PRISMA_TX_TIMEOUT_MS = 5000;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'PRISMA_TX_MAX_WAIT_MS debe ser un entero.' })
  @Min(1, { message: 'PRISMA_TX_MAX_WAIT_MS debe ser mayor que cero.' })
  PRISMA_TX_MAX_WAIT_MS = 2000;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): EnvironmentVariables {
  const environment = plainToInstance(EnvironmentVariables, values, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(environment);

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(`Configuración de entorno inválida: ${messages.join(' ')}`);
  }

  return environment;
}
