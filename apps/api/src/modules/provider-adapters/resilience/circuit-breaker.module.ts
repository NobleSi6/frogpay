import { Module } from '@nestjs/common';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';
import { ProviderFaultInjector } from './provider-fault-injector';

/** Registro único de circuitos y de fallas simuladas, compartido por adaptadores, health y simuladores. */
@Module({
  providers: [{ provide: ProviderFaultInjector, useFactory: () => new ProviderFaultInjector() }, CircuitBreakerRegistry],
  exports: [CircuitBreakerRegistry, ProviderFaultInjector],
})
export class CircuitBreakerModule {}
