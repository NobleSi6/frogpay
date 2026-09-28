export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  directUrl?: string;
  rabbitmq: {
    user: string;
    pass: string;
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
    url: process.env.RABBITMQ_URL,
  },
});
