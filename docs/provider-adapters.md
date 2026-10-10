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

## Dashboard method selector

`GET /api/dashboard/payment-methods` returns the configured methods' public
codes, labels, processing modes, and token requirements. It is protected by
the global JWT authentication guard and restricted to `OWNER` and `ADMIN`.
Provider ids and fee configuration are not included in the selector response.

## Dependency boundary

The API ESLint flat config rejects provider SDK imports and imports from
adapter/provider implementation folders under `modules/payments`. The API CI
workflow runs this lint rule together with the API build and unit tests.
