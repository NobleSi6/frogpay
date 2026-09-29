CREATE TYPE "TenantStatus" AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE "TenantPlan" AS ENUM ('free', 'starter', 'pro', 'enterprise');
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_ADMIN', 'OWNER', 'ADMIN', 'DEVELOPER', 'FINANCE', 'SUPPORT');
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'suspended');
CREATE TYPE "ApiKeyType" AS ENUM ('test', 'live');

CREATE TABLE "tenants" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "tax_id" TEXT NOT NULL,
  "contact_email" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "plan" "TenantPlan" NOT NULL DEFAULT 'free',
  "webhook_url" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_tax_id_key" ON "tenants"("tax_id");
CREATE INDEX "tenants_name_idx" ON "tenants"("name");

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "role" "UserRole" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'invited',
  "invitation_token_hash" TEXT,
  "invitation_expires_at" TIMESTAMPTZ(6),
  "password_hash" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_invitation_token_hash_key" ON "users"("invitation_token_hash");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

CREATE TABLE "api_keys" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ApiKeyType" NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "masked_key" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access" ON "tenants"
  USING (current_setting('app.global_access', true) = 'true' OR "id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.global_access', true) = 'true' OR "id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "user_tenant_access" ON "users"
  USING (current_setting('app.global_access', true) = 'true' OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.global_access', true) = 'true' OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "api_key_tenant_access" ON "api_keys"
  USING (current_setting('app.global_access', true) = 'true' OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (current_setting('app.global_access', true) = 'true' OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT USAGE ON SCHEMA public TO frogpay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenants", "users", "api_keys" TO frogpay_app;
