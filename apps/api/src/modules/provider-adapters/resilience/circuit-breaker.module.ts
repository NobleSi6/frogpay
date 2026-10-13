import { Module } from '@nestjs/common';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';

/** Registro único de circuitos, compartido por los adaptadores y el health check. */
@Module({
  providers: [CircuitBreakerRegistry],
  exports: [CircuitBreakerRegistry],
})
export class CircuitBreakerModule {}
