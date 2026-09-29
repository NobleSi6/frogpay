-- ============================================================
-- FrogPay — 0_init: migración base consolidada
-- Generada a mano a partir de los scripts ya aplicados en
-- Supabase: frogpay_modelo_datos.sql + parche 01 (checks) +
-- parche 02, secciones 1-4 (helpers de RLS a prueba de '',
-- default privileges, revoke DELETE en payment/refund).
--
-- EXCLUIDO A PROPÓSITO de este archivo:
--  - CREATE ROLE frogpay_app (lleva contraseña; se crea a mano
--    una sola vez, fuera del historial de migraciones).
--  - INSERTs de catálogo (role/payment_method/provider/plan):
--    viven en prisma/seed.ts, para no tener dos fuentes de
--    verdad para los mismos datos.
--  - Sección 5 del parche 02 (UPDATE plan SET features...):
--    depende de que ya existan filas en plan. Si corriera aquí
--    (antes del seed), afectaría 0 filas sin avisar. Los valores
--    de features ahora se setean directo en seed.ts.
--  - Sección 6 del parche 02 (trigger de historial inicial en
--    'pending'): queda comentada, pendiente de decisión con
--    el Arquitecto (ver nota en el propio parche 02 original).
--
-- Aplicar con:
--   npx prisma migrate resolve --applied 0_init
-- (desde apps/api, después de copiar este contenido tal cual a
--  apps/api/prisma/migrations/0_init/migration.sql)
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- PARTE 1 de 3 — Schema base (tablas, triggers, RLS, rol)
-- Fuente: frogpay_modelo_datos.sql
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- FrogPay — Modelo de datos completo (Sprint 1 a Sprint 4)
-- PostgreSQL 15+ / Supabase
-- Incorpora la revisión de seguridad e integridad del Arquitecto.
--
-- IMPORTANTE sobre Prisma: este script usa triggers, índices
-- parciales y CHECK constraints que Prisma NO puede expresar en
-- schema.prisma. Aplíquenlo así:
--   1) npx prisma migrate dev --create-only --name init_schema
--   2) reemplacen el SQL generado por ESTE archivo completo
--   3) npx prisma migrate deploy
-- Así queda dentro del historial de migraciones de Prisma en vez
-- de ser un cambio "por fuera" que un futuro `prisma db push`
-- podría pisar.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. CATÁLOGOS GLOBALES (sin RLS, solo lectura para la app)
-- ============================================================

CREATE TABLE role (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL UNIQUE,
    monthly_price           numeric(10,2) NOT NULL DEFAULT 0,
    monthly_volume_limit    numeric(14,2) CHECK (monthly_volume_limit IS NULL OR monthly_volume_limit >= 0),
    features                jsonb NOT NULL DEFAULT '{}',
    commission_fixed        numeric(10,2) NOT NULL DEFAULT 0 CHECK (commission_fixed >= 0),
    commission_pct          numeric(5,4) NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 1),
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_method (
    id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code    text NOT NULL UNIQUE,
    name    text NOT NULL
);

CREATE TABLE provider (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                text NOT NULL UNIQUE,
    name                text NOT NULL,
    payment_method_id   uuid NOT NULL REFERENCES payment_method(id),
    is_active           boolean NOT NULL DEFAULT true,
    UNIQUE (id, payment_method_id) -- target de la FK compuesta desde payment
);

-- ============================================================
-- 2. NÚCLEO ESTRUCTURAL (congelado)
-- ============================================================

CREATE TABLE tenant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    business_name   text NOT NULL,
    tax_id          text NOT NULL UNIQUE,
    address         text,
    contact_email   text CHECK (contact_email IS NULL OR contact_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    contact_phone   text,
    status          text NOT NULL DEFAULT 'invited'
                    CHECK (status IN ('invited','active','suspended')),
    plan_id         uuid REFERENCES plan(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tenant_plan ON tenant(plan_id);

-- Renombrada de "user" a app_user (evita pelear con la palabra reservada)
CREATE TABLE app_user (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid REFERENCES tenant(id), -- NULL = Platform Admin
    role_id                 uuid NOT NULL REFERENCES role(id),
    email                   text NOT NULL,
    password_hash           text,
    status                  text NOT NULL DEFAULT 'invited'
                            CHECK (status IN ('invited','active','disabled')),
    -- guardar el HASH del token de invitación, no el valor crudo
    invitation_token        text,
    invitation_expires_at   timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'active' OR password_hash IS NOT NULL),
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);
CREATE UNIQUE INDEX idx_app_user_email_lower ON app_user (lower(email));
CREATE UNIQUE INDEX idx_app_user_invitation_token ON app_user(invitation_token) WHERE invitation_token IS NOT NULL;
CREATE INDEX idx_app_user_tenant ON app_user(tenant_id);
CREATE INDEX idx_app_user_role ON app_user(role_id);

CREATE TABLE api_key (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id),
    name            text,
    key_prefix      text NOT NULL UNIQUE,
    secret_hash     text NOT NULL,
    environment     text NOT NULL CHECK (environment IN ('sandbox','production')),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
    last_used_at    timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_apikey_tenant ON api_key(tenant_id);
-- (idx_apikey_prefix eliminado: redundante, key_prefix ya es UNIQUE)

CREATE TABLE tenant_plan_usage (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenant(id),
    period      char(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- solo cuenta pagos con environment = 'production' (lógica de aplicación)
    volume_used numeric(14,2) NOT NULL DEFAULT 0,
    tx_count    integer NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, period)
);

CREATE TABLE tenant_provider_credential (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenant(id),
    provider_id             uuid NOT NULL REFERENCES provider(id),
    environment             text NOT NULL CHECK (environment IN ('sandbox','production')),
    credentials_encrypted   text NOT NULL,
    is_active               boolean NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider_id, environment),
    UNIQUE (id, tenant_id, provider_id, environment) -- target de la FK compuesta desde payment
);
-- (idx_tpc_tenant eliminado: cubierto por el índice del UNIQUE de arriba)

CREATE TABLE payment (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       uuid NOT NULL REFERENCES tenant(id),
    idempotency_key                 text NOT NULL,
    idempotency_body_hash           text NOT NULL, -- detecta reuso de la key con otro payload
    amount                          numeric(14,2) NOT NULL CHECK (amount > 0),
    currency                        char(3) NOT NULL DEFAULT 'BOB' CHECK (currency ~ '^[A-Z]{3}$'),
    status                          text NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','approved','rejected','failed','expired','refunded','partially_refunded')),
    payment_method_id               uuid NOT NULL,
    provider_id                     uuid NOT NULL,
    environment                     text NOT NULL DEFAULT 'sandbox'
                                    CHECK (environment IN ('sandbox','production')),
    tenant_provider_credential_id   uuid,
    provider_transaction_id         text,
    merchant_reference              text,
    error_code                      text,
    commission_amount               numeric(14,2) CHECK (commission_amount IS NULL OR commission_amount >= 0),
    net_amount                      numeric(14,2) CHECK (net_amount IS NULL OR commission_amount IS NULL OR net_amount = amount - commission_amount),
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (id, tenant_id), -- target de las FKs compuestas de refund/history/webhook_delivery
    FOREIGN KEY (provider_id, payment_method_id) REFERENCES provider(id, payment_method_id),
    FOREIGN KEY (tenant_provider_credential_id, tenant_id, provider_id, environment)
        REFERENCES tenant_provider_credential(id, tenant_id, provider_id, environment)
);
CREATE INDEX idx_payment_tenant_created ON payment(tenant_id, created_at DESC);
CREATE INDEX idx_payment_tenant_status  ON payment(tenant_id, status);
CREATE INDEX idx_payment_tenant_env     ON payment(tenant_id, environment);
CREATE UNIQUE INDEX idx_payment_provider_txn ON payment(provider_id, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE refund (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id              uuid NOT NULL,
    tenant_id               uuid NOT NULL,
    amount                  numeric(14,2) NOT NULL CHECK (amount > 0),
    reason                  text,
    -- NULL = reembolso automático del sistema (ej. circuit breaker)
    authorized_by_user_id   uuid REFERENCES app_user(id),
    status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','completed','failed')),
    provider_refund_id      text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (payment_id, tenant_id) REFERENCES payment(id, tenant_id)
);
CREATE INDEX idx_refund_payment       ON refund(payment_id);
CREATE INDEX idx_refund_tenant        ON refund(tenant_id, created_at DESC);
CREATE INDEX idx_refund_authorized_by ON refund(authorized_by_user_id);

CREATE TABLE webhook (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenant(id),
    url                 text NOT NULL CHECK (url ~ '^https://'),
    secret_encrypted    text NOT NULL,
    event_types         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(event_types) = 'array'),
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, tenant_id) -- target de la FK compuesta desde webhook_delivery
);
CREATE INDEX idx_webhook_tenant ON webhook(tenant_id);

CREATE TABLE domain_event_outbox (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  text NOT NULL,
    aggregate_id    uuid NOT NULL,
    tenant_id       uuid REFERENCES tenant(id),
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','failed')),
    attempt_count   integer NOT NULL DEFAULT 0,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    published_at    timestamptz
);
CREATE INDEX idx_outbox_pending ON domain_event_outbox(created_at) WHERE status = 'pending';

-- ============================================================
-- 3. CAPAS DERIVADAS
-- ============================================================

CREATE TABLE payment_status_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      uuid NOT NULL,
    tenant_id       uuid NOT NULL,
    previous_status text,
    new_status      text NOT NULL
                    CHECK (new_status IN ('pending','approved','rejected','failed','expired','refunded','partially_refunded')),
    metadata        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (payment_id, tenant_id) REFERENCES payment(id, tenant_id)
);
CREATE INDEX idx_psh_payment ON payment_status_history(payment_id, created_at);
CREATE INDEX idx_psh_tenant  ON payment_status_history(tenant_id);

CREATE TABLE webhook_delivery (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      uuid NOT NULL,
    tenant_id       uuid NOT NULL,
    payment_id      uuid, -- NULL: eventos no ligados a un pago
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','delivered','failed','dead_letter')),
    attempt_count   integer NOT NULL DEFAULT 0,
    next_retry_at   timestamptz,
    response_code   integer,
    last_error      text,
    delivered_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (webhook_id, tenant_id) REFERENCES webhook(id, tenant_id),
    FOREIGN KEY (payment_id, tenant_id) REFERENCES payment(id, tenant_id)
);
CREATE INDEX idx_wd_webhook_status ON webhook_delivery(webhook_id, status);
CREATE INDEX idx_wd_pending_retry  ON webhook_delivery(next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_wd_payment        ON webhook_delivery(payment_id);
CREATE INDEX idx_wd_tenant         ON webhook_delivery(tenant_id);

CREATE TABLE audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid REFERENCES tenant(id),
    actor_user_id   uuid REFERENCES app_user(id),
    action          text NOT NULL,
    resource_type   text NOT NULL,
    resource_id     uuid,
    metadata        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_created ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);

CREATE TABLE daily_tenant_metrics (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenant(id),
    date                date NOT NULL,
    environment         text NOT NULL DEFAULT 'production' CHECK (environment IN ('sandbox','production')),
    total_volume        numeric(14,2) NOT NULL DEFAULT 0,
    total_count         integer NOT NULL DEFAULT 0,
    approved_count      integer NOT NULL DEFAULT 0,
    rejected_count      integer NOT NULL DEFAULT 0,
    method_breakdown    jsonb NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, date, environment),
    CHECK (approved_count + rejected_count <= total_count)
);

-- ============================================================
-- 4. TRIGGERS (requieren que las tablas ya existan)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_updated_at BEFORE UPDATE ON tenant
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_app_user_updated_at BEFORE UPDATE ON app_user
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_updated_at BEFORE UPDATE ON payment
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_refund_updated_at BEFORE UPDATE ON refund
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_webhook_delivery_updated_at BEFORE UPDATE ON webhook_delivery
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Inmutabilidad de audit_log y payment_status_history
CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% es append-only: no se permite UPDATE, DELETE ni TRUNCATE', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_psh_immutable BEFORE UPDATE OR DELETE ON payment_status_history
    FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER trg_psh_no_truncate BEFORE TRUNCATE ON payment_status_history
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation();

-- Máquina de estados de payment
CREATE OR REPLACE FUNCTION enforce_payment_status_transition() RETURNS trigger AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status = 'pending' AND NEW.status IN ('approved','rejected','failed','expired'))
        OR (OLD.status = 'approved' AND NEW.status IN ('refunded','partially_refunded'))
        OR (OLD.status = 'partially_refunded' AND NEW.status = 'refunded')
    ) THEN
        RAISE EXCEPTION 'Transición de estado no permitida: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_status_transition BEFORE UPDATE OF status ON payment
    FOR EACH ROW EXECUTE FUNCTION enforce_payment_status_transition();

-- Historial automático (si este trigger está activo, el backend
-- NO debe insertar manualmente en payment_status_history)
CREATE OR REPLACE FUNCTION sync_payment_status_history() RETURNS trigger AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO payment_status_history (payment_id, tenant_id, previous_status, new_status, metadata)
        VALUES (
            NEW.id, NEW.tenant_id, OLD.status, NEW.status,
            COALESCE(NULLIF(current_setting('app.status_change_metadata', true), '')::jsonb, '{}')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_status_history AFTER UPDATE OF status ON payment
    FOR EACH ROW EXECUTE FUNCTION sync_payment_status_history();

-- Control de reembolsos (con lock para evitar reembolsos simultáneos)
CREATE OR REPLACE FUNCTION enforce_refund_limit() RETURNS trigger AS $$
DECLARE
    v_payment           payment%ROWTYPE;
    v_already_refunded  numeric(14,2);
BEGIN
    SELECT * INTO v_payment FROM payment WHERE id = NEW.payment_id FOR UPDATE;

    IF v_payment.status NOT IN ('approved','partially_refunded') THEN
        RAISE EXCEPTION 'No se puede reembolsar un pago en estado %', v_payment.status;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
    FROM refund
    WHERE payment_id = NEW.payment_id AND status <> 'failed';

    IF v_already_refunded + NEW.amount > v_payment.amount THEN
        RAISE EXCEPTION 'El monto reembolsado (%) excede el monto del pago (%)',
            v_already_refunded + NEW.amount, v_payment.amount;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refund_limit BEFORE INSERT ON refund
    FOR EACH ROW EXECUTE FUNCTION enforce_refund_limit();

-- ============================================================
-- 5. ROL DEL BACKEND Y PERMISOS
-- ============================================================

-- El rol frogpay_app se crea manualmente, con una contraseña real
-- fuera de esta migración (nunca en el historial de Prisma):
--   CREATE ROLE frogpay_app WITH LOGIN PASSWORD '<contraseña real>' NOBYPASSRLS;
-- Los GRANT/REVOKE de abajo sí van aquí porque no llevan credenciales
-- y deben aplicarse cada vez que el schema se recree desde cero.
GRANT USAGE ON SCHEMA public TO frogpay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO frogpay_app;

-- Catálogos: solo lectura para la app
REVOKE INSERT, UPDATE, DELETE ON role, plan, payment_method, provider FROM frogpay_app;

-- audit_log y payment_status_history: solo INSERT + SELECT (append-only)
REVOKE UPDATE, DELETE ON audit_log, payment_status_history FROM frogpay_app;

-- Todo pasa por el backend: sin acceso directo de Supabase (PostgREST)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON SCHEMA public FROM anon, authenticated;

-- ============================================================
-- 6. ROW LEVEL SECURITY
--    La app debe ejecutar, dentro de cada transacción:
--      SET LOCAL app.current_tenant_id = '<uuid>';
--      SET LOCAL app.global_access = 'true'|'false';
--    global_access = true SOLO para: Platform Admin, workers de
--    outbox/webhooks, login por email, validación de API key,
--    webhooks entrantes del proveedor — y solo para la query
--    puntual que lo necesita, no para todo el request.
-- ============================================================

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'api_key', 'tenant_plan_usage', 'tenant_provider_credential',
        'payment', 'refund', 'webhook', 'payment_status_history',
        'webhook_delivery', 'daily_tenant_metrics'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I FOR ALL TO frogpay_app
             USING (
                 tenant_id = current_setting(''app.current_tenant_id'', true)::uuid
                 OR current_setting(''app.global_access'', true)::boolean = true
             )
             WITH CHECK (
                 tenant_id = current_setting(''app.current_tenant_id'', true)::uuid
                 OR current_setting(''app.global_access'', true)::boolean = true
             );', t
        );
    END LOOP;
END $$;

-- Casos especiales (tenant_id nullable o inexistente en la propia tabla)

ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_isolation ON tenant FOR ALL TO frogpay_app
USING (
    id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
)
WITH CHECK (
    id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
);

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_user_tenant_isolation ON app_user FOR ALL TO frogpay_app
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
)
WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
);

ALTER TABLE domain_event_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_tenant_isolation ON domain_event_outbox FOR ALL TO frogpay_app
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
)
WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_isolation ON audit_log FOR ALL TO frogpay_app
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
)
WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR current_setting('app.global_access', true)::boolean = true
);

-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- PARTE 2 de 3 — Parche 01: CHECKs menores faltantes
-- Fuente: frogpay_parche_01_checks.sql
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- Parche 01: CHECKs menores faltantes (ejecutar en el SQL Editor
-- de Supabase sobre la base ya creada). Es idempotente solo si
-- se corre una vez: si repiten, fallará por nombre duplicado.
-- ============================================================

ALTER TABLE payment_status_history
    ADD CONSTRAINT chk_psh_previous_status
    CHECK (previous_status IS NULL OR previous_status IN
        ('pending','approved','rejected','failed','expired','refunded','partially_refunded'));

ALTER TABLE tenant_plan_usage
    ADD CONSTRAINT chk_usage_volume_nonneg  CHECK (volume_used >= 0),
    ADD CONSTRAINT chk_usage_txcount_nonneg CHECK (tx_count >= 0);

ALTER TABLE daily_tenant_metrics
    ADD CONSTRAINT chk_metrics_nonneg
    CHECK (total_volume >= 0 AND total_count >= 0 AND approved_count >= 0 AND rejected_count >= 0);

ALTER TABLE webhook_delivery
    ADD CONSTRAINT chk_wd_attempts_nonneg CHECK (attempt_count >= 0);

ALTER TABLE domain_event_outbox
    ADD CONSTRAINT chk_outbox_attempts_nonneg CHECK (attempt_count >= 0);

-- ═══════════════════════════════════════════════════════════
-- PARTE 3 de 3 — Parche 02 (secciones 1-4 solamente)
-- Helpers de sesión a prueba de '', políticas reescritas,
-- default privileges, revoke DELETE en payment/refund
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- Parche 02: endurecimiento de RLS y detalles de operación
--
-- Ejecutar DESPUÉS del schema y del parche 01, con el usuario
-- admin (postgres) en el SQL Editor de Supabase. Nunca con
-- frogpay_app.
--
-- OJO: este script se escribió sin poder ejecutarlo contra una
-- base real. Pruébenlo primero en un proyecto/rama de desarrollo
-- y corran las verificaciones del final.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Helpers de sesión a prueba de valores vacíos
--
-- Problema: cuando set_config(..., true) termina su transacción,
-- Postgres deja la variable definida como '' (cadena vacía) en esa
-- conexión, no como NULL. En una conexión reutilizada del pooler,
-- current_setting('app.global_access', true)::boolean lanza
--   ERROR: invalid input syntax for type boolean: ""
-- y '' ::uuid lanza un error equivalente. Las políticas actuales
-- fallan de forma intermitente según el estado de la conexión.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_global_access() RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('app.global_access', true), '')::boolean, false)
$$;

GRANT EXECUTE ON FUNCTION app_current_tenant_id(), app_global_access() TO frogpay_app;

-- ------------------------------------------------------------
-- 2. Reescribir las políticas usando los helpers
-- ------------------------------------------------------------

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'api_key', 'tenant_plan_usage', 'tenant_provider_credential',
        'payment', 'refund', 'webhook', 'payment_status_history',
        'webhook_delivery', 'daily_tenant_metrics'
    ]
    LOOP
        EXECUTE format(
            'ALTER POLICY tenant_isolation ON %I
             USING (tenant_id = app_current_tenant_id() OR app_global_access())
             WITH CHECK (tenant_id = app_current_tenant_id() OR app_global_access());', t
        );
    END LOOP;
END $$;

ALTER POLICY tenant_self_isolation ON tenant
    USING (id = app_current_tenant_id() OR app_global_access())
    WITH CHECK (id = app_current_tenant_id() OR app_global_access());

ALTER POLICY app_user_tenant_isolation ON app_user
    USING (tenant_id = app_current_tenant_id() OR app_global_access())
    WITH CHECK (tenant_id = app_current_tenant_id() OR app_global_access());

ALTER POLICY outbox_tenant_isolation ON domain_event_outbox
    USING (tenant_id = app_current_tenant_id() OR app_global_access())
    WITH CHECK (tenant_id = app_current_tenant_id() OR app_global_access());

ALTER POLICY audit_tenant_isolation ON audit_log
    USING (tenant_id = app_current_tenant_id() OR app_global_access())
    WITH CHECK (tenant_id = app_current_tenant_id() OR app_global_access());

-- ------------------------------------------------------------
-- 3. Permisos por defecto para tablas futuras
--    (GRANT ... ON ALL TABLES solo cubre las que existen hoy; sin
--    esto, una tabla nueva en Sprint 2+ da "permission denied").
--    Aplica a objetos creados por el rol que ejecuta este script.
-- ------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO frogpay_app;

-- ------------------------------------------------------------
-- 4. Registros de dinero: la app nunca borra pagos ni reembolsos
--    (cancelar/anular = cambio de estado, no DELETE).
--    Si esto complica sus tests, límpienlos con el usuario admin.
-- ------------------------------------------------------------

REVOKE DELETE ON payment, refund FROM frogpay_app;

-- ------------------------------------------------------------
COMMIT;