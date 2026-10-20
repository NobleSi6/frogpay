# Arquitectura C4 de FrogPay

Estos diagramas describen la implementación actual al 20-10-2026. Se mantienen
como texto Mermaid versionado para poder revisarlos en Git y renderizarlos en
GitHub, VS Code o Mermaid Live Editor. Copia el contenido de cada bloque
`mermaid` al editor Mermaid si necesitas exportar una imagen.

## Nivel 1 — Contexto

Fuente Mermaid: [nivel-1-contexto.md](./nivel-1-contexto.md).

## Nivel 2 — Contenedores

Fuente Mermaid: [nivel-2-contenedores.md](./nivel-2-contenedores.md).

## Nivel 3 — Componentes de la API

Fuente Mermaid: [nivel-3-componentes.md](./nivel-3-componentes.md).

## Despliegue

Fuente Mermaid: [despliegue.md](./despliegue.md).

## Modelo de datos

El ERD lógico final refleja los 18 modelos del schema Prisma versionado. Las
migraciones SQL son la fuente de verdad para RLS, triggers, constraints e
índices que Prisma no representa.

Fuente Mermaid: [../erd/README.md](../erd/README.md).

## Convenciones y límites

- API y Dashboard son procesos separados; los módulos de negocio backend se
  despliegan juntos como un monolito modular.
- PostgreSQL es el almacén transaccional. En desarrollo puede levantarse con
  Compose; la conexión y los roles deben seguir el procedimiento de la guía
  local. La opción gestionada documentada es PostgreSQL/Supabase.
- NGINX ofrece TLS en el borde. En Compose, la comunicación entre servicios
  Docker es HTTP/AMQP en la red privada; no se debe interpretar el diagrama como
  evidencia de cifrado TLS de cada salto interno.
- Observabilidad está en un perfil Compose opcional y usa Prometheus, Grafana,
  Loki y Tempo con OpenTelemetry.
- Los adapters de QR y transferencia bancaria son integraciones locales/sandbox
  del MVP, no conexión certificada a redes bancarias o adquirentes reales.
- Escalar API a dos instancias está previsto para pruebas con el override
  `docker-compose.k6.yml`; el despliegue multi-réplica no es el Compose de
  desarrollo por defecto.
