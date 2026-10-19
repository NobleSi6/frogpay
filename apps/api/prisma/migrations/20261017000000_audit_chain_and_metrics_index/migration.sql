CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_immutable;
ALTER TABLE audit_log DISABLE TRIGGER trg_audit_log_no_truncate;

ALTER TABLE audit_log RENAME COLUMN resource_type TO entity;
ALTER TABLE audit_log RENAME COLUMN resource_id TO entity_id;

ALTER TABLE audit_log
    ADD COLUMN event_id uuid,
    ADD COLUMN previous_state jsonb,
    ADD COLUMN new_state jsonb,
    ADD COLUMN actor jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN request_id text,
    ADD COLUMN environment text NOT NULL DEFAULT 'production',
    ADD COLUMN occurred_at timestamptz,
    ADD COLUMN previous_hash char(64),
    ADD COLUMN record_hash char(64);

CREATE OR REPLACE FUNCTION audit_compute_hash(
    p_event_id uuid,
    p_tenant_id uuid,
    p_entity text,
    p_entity_id uuid,
    p_action text,
    p_previous_state jsonb,
    p_new_state jsonb,
    p_actor jsonb,
    p_request_id text,
    p_environment text,
    p_occurred_at timestamptz,
    p_previous_hash text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT encode(
        digest(
            jsonb_build_object(
                'version', 1,
                'eventId', p_event_id,
                'tenantId', p_tenant_id,
                'entity', p_entity,
                'entityId', p_entity_id,
                'action', p_action,
                'previousState', p_previous_state,
                'newState', p_new_state,
                'actor', p_actor,
                'requestId', p_request_id,
                'environment', p_environment,
                'occurredAt', p_occurred_at,
                'previousHash', p_previous_hash
            )::text,
            'sha256'
        ),
        'hex'
    )
$$;

UPDATE audit_log
SET event_id = id,
    occurred_at = created_at,
    actor = CASE
        WHEN actor_user_id IS NULL THEN '{"type":"system"}'::jsonb
        ELSE jsonb_build_object('type', 'user', 'userId', actor_user_id)
    END;

DO $$
DECLARE
    tenant_record record;
    audit_record record;
    chain_hash text;
BEGIN
    FOR tenant_record IN SELECT DISTINCT tenant_id FROM audit_log WHERE tenant_id IS NOT NULL LOOP
        chain_hash := NULL;
        FOR audit_record IN
            SELECT * FROM audit_log
            WHERE tenant_id = tenant_record.tenant_id
            ORDER BY occurred_at, id
        LOOP
            UPDATE audit_log
            SET previous_hash = chain_hash,
                record_hash = audit_compute_hash(
                    audit_record.event_id,
                    audit_record.tenant_id,
                    audit_record.entity,
                    audit_record.entity_id,
                    audit_record.action,
                    audit_record.previous_state,
                    audit_record.new_state,
                    audit_record.actor,
                    audit_record.request_id,
                    audit_record.environment,
                    audit_record.occurred_at,
                    chain_hash
                )
            WHERE id = audit_record.id
            RETURNING record_hash INTO chain_hash;
        END LOOP;
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM audit_log WHERE tenant_id IS NULL) THEN
        RAISE EXCEPTION 'audit_log contiene filas sin tenant_id; asígnelas antes de aplicar la migración de Sprint 4';
    END IF;
END $$;

ALTER TABLE audit_log
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN event_id SET NOT NULL,
    ALTER COLUMN occurred_at SET NOT NULL,
    ALTER COLUMN record_hash SET NOT NULL,
    ALTER COLUMN environment DROP DEFAULT,
    ADD CONSTRAINT uq_audit_log_event_id UNIQUE (event_id),
    ADD CONSTRAINT chk_audit_log_hashes CHECK (
        record_hash ~ '^[0-9a-f]{64}$'
        AND (previous_hash IS NULL OR previous_hash ~ '^[0-9a-f]{64}$')
    ),
    ADD CONSTRAINT chk_audit_log_environment CHECK (environment IN ('sandbox', 'production'));

CREATE INDEX idx_audit_tenant_entity_created
    ON audit_log(tenant_id, entity_id, created_at DESC);
CREATE INDEX idx_audit_tenant_action_created
    ON audit_log(tenant_id, action, created_at DESC);
CREATE INDEX idx_payment_tenant_env_created
    ON payment(tenant_id, environment, created_at DESC);

ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_immutable;
ALTER TABLE audit_log ENABLE TRIGGER trg_audit_log_no_truncate;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM frogpay_app;
GRANT SELECT, INSERT ON audit_log TO frogpay_app;
GRANT EXECUTE ON FUNCTION audit_compute_hash(
    uuid, uuid, text, uuid, text, jsonb, jsonb, jsonb, text, text, timestamptz, text
) TO frogpay_app;
