# Hardening de seguridad — TSK-DEV2-403

| Control | Implementación | Evidencia |
|---|---|---|
| Rate limiting por tenant y API Key | `RateLimitInterceptor` + Redis (ventana de 60 s). Límites por plan: Free `RATE_LIMIT_FREE_PER_MINUTE` (60), Premium `RATE_LIMIT_PREMIUM_PER_MINUTE` (600) o `features.requestsPerMinute`. Responde **429 `rate_limit_exceeded`** con `Retry-After` y `X-RateLimit-*`. | `rate-limit.service.spec.ts`, `security.setup.spec.ts` |
| Cabeceras de seguridad | `helmet`: HSTS 1 año, `nosniff`, CSP con `frame-ancestors 'none'`, sin `X-Powered-By`. | `security.setup.spec.ts` |
| CORS restringido | Solo los orígenes de `CORS_ORIGIN` (lista separada por comas). | `security.setup.spec.ts` |
| Validación estricta de DTOs | `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `forbidUnknownValues`. | Pruebas de controladores (campos extra → 422) |
| TLS y HSTS en el borde | NGINX (`infra/nginx/nginx.conf`) con TLS 1.2/1.3, redirección 80→443 y HSTS. Certificado autofirmado en dev: `scripts/generate-dev-cert.sh`. | `curl -kI https://localhost:8443/health` |
| Simuladores fuera de producción | `/api/v1/test/*` responde **403** si `NODE_ENV=production`. | `security.setup.spec.ts` |
| Dependencias | `npm audit --omit=dev --audit-level=high` en CI. | `docs/seguridad/npm-audit.txt` |
| Secretos en el repositorio | gitleaks con `.gitleaks.toml` en CI (todo el historial). | `docs/seguridad/gitleaks.txt` |

## Cómo regenerar los reportes

```bash
npm audit --omit=dev --audit-level=high > docs/seguridad/npm-audit.txt; echo "exit=$?" >> docs/seguridad/npm-audit.txt
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.24.3 detect --source /repo --config /repo/.gitleaks.toml --redact --verbose > docs/seguridad/gitleaks.txt 2>&1; echo "exit=$?" >> docs/seguridad/gitleaks.txt
```

`exit=0` en ambos archivos significa que no hay vulnerabilidades altas o críticas ni secretos expuestos.

## Proxy con TLS en local

```bash
./scripts/generate-dev-cert.sh
docker compose --profile proxy up -d
curl -kI https://localhost:8443/health      # Strict-Transport-Security presente
curl -I  http://localhost:8080/health       # 301 hacia https
```
