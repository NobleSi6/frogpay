export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  directUrl?: string;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  rabbitmq: {
    user: string;
    pass: string;
    host: string;
    url?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_URL,
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '3600', 10),
  rabbitmq: {
    user: process.env.RABBITMQ_USER || 'frogpay',
    pass: process.env.RABBITMQ_PASS || 'guest',
    host: process.env.RABBITMQ_HOST || 'localhost',
    url: process.env.RABBITMQ_URL || createLocalRabbitUrl(),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
});

function createLocalRabbitUrl(): string {
  const url = new URL(`amqp://${process.env.RABBITMQ_HOST || 'localhost'}:5672`);
  url.username = process.env.RABBITMQ_USER || 'frogpay';
  url.password = process.env.RABBITMQ_PASS || 'guest';
  return url.toString();
}
