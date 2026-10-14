-- Sprint 3 · TSK-DEV2-301 / TSK-DEV2-302 / TSK-DEV2-303
-- Webhooks salientes: ambiente por endpoint, borrado lógico,
-- idempotencia por evento e historial de intentos.

-- 1. Endpoints: ambiente, actualización y borrado lógico
ALTER TABLE webhook
    ADD COLUMN environment text NOT NULL DEFAULT 'sandbox'
        CHECK (environment IN ('sandbox', 'production')),
    ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN deleted_at  timestamptz;

-- En sandbox se permite http:// para receptores locales; en producción solo https://
ALTER TABLE webhook DROP CONSTRAINT IF EXISTS webhook_url_check;
ALTER TABLE webhook ADD CONSTRAINT chk_webhook_url
    CHECK (url ~ '^https://' OR (environment = 'sandbox' AND url ~ '^http://'));

CREATE INDEX idx_webhook_tenant_env_active
    ON webhook (tenant_id, environment) WHERE is_active AND deleted_at IS NULL;

-- 2. Entregas: idempotencia por evento (un evento = una entrega por endpoint)
ALTER TABLE webhook_delivery ADD COLUMN event_id uuid;
CREATE UNIQUE INDEX uq_wd_webhook_event
    ON webhook_delivery (webhook_id, event_id) WHERE event_id IS NOT NULL;

-- 3. Historial de cada intento de entrega
CREATE TABLE webhook_delivery_attempt (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     uuid NOT NULL REFERENCES webhook_delivery(id),
    tenant_id       uuid NOT NULL REFERENCES tenant(id),
    attempt_number  integer NOT NULL CHECK (attempt_number >= 1),
    response_code   integer,
    error           text,
    duration_ms     integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    succeeded       boolean NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (delivery_id, attempt_number)
);
CREATE INDEX idx_wda_delivery ON webhook_delivery_attempt (delivery_id, attempt_number);
CREATE INDEX idx_wda_tenant   ON webhook_delivery_attempt (tenant_id);

ALTER TABLE webhook_delivery_attempt ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_delivery_attempt FOR ALL TO frogpay_app
    USING (tenant_id = app_current_tenant_id() OR app_global_access())
    WITH CHECK (tenant_id = app_current_tenant_id() OR app_global_access());

GRANT SELECT, INSERT ON webhook_delivery_attempt TO frogpay_app;
-- El historial de intentos es de solo inserción
REVOKE UPDATE, DELETE ON webhook_delivery_attempt FROM frogpay_app;
