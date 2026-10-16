import { Redis as IORedis } from 'ioredis';

declare module 'ioredis' {
  interface Redis {
    eval(script: string, numkeys: number, ...keys: string[]): Promise<any>;
  }
}

// Re-export para uso en el código
export { IORedis as Redis };