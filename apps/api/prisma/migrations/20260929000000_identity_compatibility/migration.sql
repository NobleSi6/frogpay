ALTER TABLE tenant
  ADD COLUMN webhook_url text,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';

ALTER TABLE tenant
  DROP CONSTRAINT IF EXISTS tenant_status_check,
  ADD CONSTRAINT tenant_status_check
    CHECK (status IN ('invited', 'active', 'inactive', 'suspended'));

ALTER TABLE app_user
  ADD COLUMN name text;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS app_user_status_check,
  ADD CONSTRAINT app_user_status_check
    CHECK (status IN ('invited', 'active', 'disabled', 'suspended'));

ALTER TABLE api_key
  ADD COLUMN masked_key text NOT NULL DEFAULT '',
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE api_key
SET masked_key = key_prefix || '...'
WHERE masked_key = '';

ALTER TABLE api_key
  ALTER COLUMN masked_key DROP DEFAULT;