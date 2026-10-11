# Payment provider adapters

`PaymentProviderPort` is the provider boundary. Its metadata declares the
adapter id, public label, enabled method capabilities, processing mode,
payment-token requirement, and reference fee structure. The existing
`CreatePaymentUseCase` consumes `PaymentProviderRegistry`; it must not import
an adapter or a provider SDK.

## Adding an adapter

1. Create an injectable adapter under
   `apps/api/src/modules/provider-adapters/adapters/<provider>/`.
2. Implement `PaymentProviderPort` and declare every supported method in
   `metadata.methods`.
3. Add the adapter class to `PAYMENT_PROVIDER_ADAPTERS` in
   `apps/api/src/modules/provider-adapters/provider-adapters.config.ts`.
4. Configure method selection with `PAYMENT_PROVIDER_BINDINGS`, for example
   `card=stripe`. Bindings replace the defaults when set. Startup fails for
   missing adapters, unsupported methods, or ambiguous registrations.
5. Normalize provider failures to the error codes in
   `apps/api/src/shared/http/errors/error-catalog.ts` before returning a
   `ProviderResult`.

An adapter that is the only registered implementation for a method can be
selected from its metadata. When multiple adapters declare the same method,
an explicit binding is required.

`fees` is descriptive adapter metadata; this task does not change the payment
domain's plan-based commission calculation. `processingMode` describes the
adapter capability and does not by itself introduce asynchronous orchestration.

## Local mock

The deterministic `MockPaymentProviderAdapter` is disabled by default and
simulates approval without network access. Set
`PAYMENT_MOCK_ADAPTER_ENABLED=true` outside production to register it, then set
`PAYMENT_PROVIDER_BINDINGS=card=mock` to route the existing `card` method
through the mock. The Stripe adapter remains the default. In production the
mock is always excluded; requesting it with the enable flag logs a warning.

## Local QR

`QRLocalPaymentProviderAdapter` registers `qr` as an asynchronous method that
does not require a payment token. It returns a simulated EMVCo `qrPayload` and
an `expiresAt` timestamp; the payment remains `pending` until settlement or
the QR expiration job rejects it. Configure the job with
`QR_EXPIRATION_MINUTES`, `QR_EXPIRATION_JOB_ENABLED`, and
`QR_EXPIRATION_JOB_INTERVAL_SECONDS`. The QR payload is local simulation data,
not a request to an external QR provider.

### QR simulator

In non-production deployments, the QR simulator can settle a sandbox QR
payment from the Dashboard with `POST /api/dashboard/payments/:id/simulate`
(JWT, `OWNER` role, body `{ "result": "APPROVED" | "FAILED" }`) or through
`POST /api/v1/test/simulators/qr-callback` (`X-Api-Key`, body
`{ "payment_id": "<uuid>", "result": "APPROVED" | "FAILED" }`). The callback
uses `payment_id` in snake_case and takes its tenant and environment from the
API key. `QR_SIMULATORS_ENABLED` controls the non-production entry points;
production deployments are rejected even if the flag is explicitly enabled.
Production API keys and production payments are also rejected.

Only pending QR sandbox payments are settled. `APPROVED` uses the standard
payment settlement flow; `FAILED` rejects with `processing_error`. Repeated
or already-final requests return the current status with `changed: false`
without creating another event. An expired pending QR is left to the
expiration job. The worker uses polling rather than RabbitMQ and approves
mature, unexpired sandbox QR payments through the same atomic settlement
service. Configure it with `QR_AUTO_CONFIRM_ENABLED`,
`QR_AUTO_CONFIRM_SECONDS` (default `10`), and
`QR_AUTO_CONFIRM_INTERVAL_SECONDS` (default `2`). Auto-confirm is disabled by
default outside production and enabled by default in production, where it
still only processes sandbox payments.

## Dashboard method selector

`GET /api/dashboard/payment-methods` returns the configured methods' public
codes, labels, processing modes, and token requirements. It is protected by
the global JWT authentication guard and restricted to `OWNER` and `ADMIN`.
Provider ids and fee configuration are not included in the selector response.

## Dependency boundary

The API ESLint flat config rejects provider SDK imports and imports from
adapter/provider implementation folders under `modules/payments`. The API CI
workflow runs this lint rule together with the API build and unit tests.
