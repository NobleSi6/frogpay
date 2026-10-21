# Hoja de ruta posterior al MVP

Este documento recoge opciones de evolución, no compromisos de entrega ni
funcionalidad que ya exista. Cada iniciativa requiere business case, evidencia
operacional, análisis de riesgos y ADR aprobado antes de iniciar implementación.

| Horizonte | Iniciativa | Disparador / trabajo previo | Consideraciones |
|---|---|---|---|
| 1 — robustecer MVP | Cerrar SLO, e2e de RLS, TLS interno, backups/restores, monitoreo y revisión cruzada del core financiero. | Evidencia de cargas, incidentes y pruebas de recuperación. | No separar servicios antes de conocer límites de capacidad y dependencias. |
| 2 — evolución de datos | Evaluar ClickHouse como almacén analítico para eventos/consultas históricas de alto volumen. | PostgreSQL transaccional o read models llegan a límites medidos; modelo de datos y latencia analítica definidos. | Mantener PostgreSQL como fuente de verdad financiera; definir retención, privacidad, deduplicación y consistencia eventual. |
| 3 — pagos ampliados | Implementar reembolsos parciales/totales con autorización, idempotencia, conciliación, auditoría, límites y estados explícitos. | Reglas comerciales, contratos con proveedores y política de riesgo aprobados. | La entidad `refund` existe en el modelo, pero no implica que la operación de reembolso esté implementada o habilitada. |
| 4 — nuevos medios | Crear `CryptoAdapter` detrás de `PaymentProviderPort` solo después de evaluar custodia, volatilidad, fraude, AML/KYC y soporte. | Caso de negocio y aprobación legal/compliance en las jurisdicciones objetivo. | No recibir ni custodiar activos digitales sin autorización, controles y proveedores adecuados. |
| 5 — adquirencia local | Integrar un adquirente local mediante adapter independiente, certificación sandbox/producción, conciliación y plan de contingencia. | Contrato, especificaciones técnicas, certificación y pruebas de liquidación con el adquirente. | No presentar adapters simulados del MVP como integración bancaria real. |
| 6 — plataforma regional | Separar módulos en microservicios cuando carga, autonomía de equipos o requisitos de aislamiento lo justifiquen. | Métricas de límites del monolito, ownership de dominios y contratos/versionado de eventos estables. | Extraer primero un bounded context; definir consistencia, observabilidad, despliegue, seguridad y operación distribuida. |
| 7 — transporte de eventos a escala | Evaluar Kafka si el volumen, retención/replay o múltiples consumidores exceden las capacidades acordadas de RabbitMQ. | Pruebas de throughput/retención y necesidad concreta de replay/stream processing. | Kafka no es una mejora automática; valorar complejidad operativa, esquema de eventos y migración sin pérdida. |
| Transversal — regulación | Determinar la figura regulatoria y obligaciones ante ASFI, incluyendo si FrogPay opera como proveedor tecnológico, procesador, agregador u otra figura. | Opinión de asesoría legal boliviana especializada, análisis del modelo contractual y consulta formal aplicable. | No afirmar que el producto está autorizado o que una figura específica aplica hasta contar con dictamen y confirmación regulatoria. |

## Criterios para decidir separación en microservicios

1. Identificar un bounded context con ownership claro y contratos estables.
2. Medir cuello de botella o necesidad de escalado independiente; evitar
   particionar solo por tamaño del código.
3. Diseñar migración compatible de eventos, datos y observabilidad, con
   despliegue reversible y reconciliación.
4. Probar fallos de red, duplicados, orden y recuperación antes de mover carga
   financiera.
5. Aprobar ADR y plan de operación/seguridad antes de dividir el monolito.

## Decisiones regulatorias y financieras

La expansión de medios de pago, custodia cripto, reembolsos y adquirencia local
requiere una evaluación legal, contable y antifraude separada. Validar
requisitos de licenciamiento, protección al consumidor, privacidad, AML/KYC,
liquidación, disputas y reportes regulatorios con especialistas antes de
ofrecer estas capacidades públicamente.
