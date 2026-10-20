-- audit_compute_hash dependía de pgcrypto (digest), que en Supabase vive en el
-- schema "extensions" y no es accesible para el rol de aplicación (ni siquiera
-- con USAGE). PostgreSQL >= 11 incluye sha256(bytea) en pg_catalog, con salida
-- idéntica a digest(data, 'sha256'), por lo que los hashes existentes siguen
-- siendo válidos.
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
        sha256(
            convert_to(
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
                'UTF8'
            )
        ),
        'hex'
    )
$$;
