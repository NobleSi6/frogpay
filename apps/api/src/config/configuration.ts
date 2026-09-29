export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  directUrl?: string;
  rabbitmq: {
    user: string;
    pass: string;
    host: string;
    url?: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_URL,
  rabbitmq: {
    user: process.env.RABBITMQ_USER || 'frogpay',
    pass: process.env.RABBITMQ_PASS || 'guest',
    host: process.env.RABBITMQ_HOST || 'localhost',
    url: process.env.RABBITMQ_URL || createLocalRabbitUrl(),
  },
});

function createLocalRabbitUrl(): string {
  const url = new URL(`amqp://${process.env.RABBITMQ_HOST || 'localhost'}:5672`);
  url.username = process.env.RABBITMQ_USER || 'frogpay';
  url.password = process.env.RABBITMQ_PASS || 'guest';
  return url.toString();
}
