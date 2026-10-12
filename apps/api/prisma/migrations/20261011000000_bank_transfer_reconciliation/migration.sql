-- AlterTable payment
ALTER TABLE payment
    ADD COLUMN IF NOT EXISTS bank_instructions jsonb,
    ADD COLUMN IF NOT EXISTS qr_payload text,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payment_expires_at ON payment(expires_at) WHERE status = 'pending';

-- CreateTable bank_transaction
CREATE TABLE IF NOT EXISTS bank_transaction (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE NO ACTION,
    external_id text,
    reference text NOT NULL,
    amount numeric(14, 2) NOT NULL,
    currency char(3) NOT NULL DEFAULT 'BOB',
    bank_name text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('reconciled', 'amount_mismatch', 'unmatched')),
    payment_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (payment_id, tenant_id) REFERENCES payment(id, tenant_id) ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_bt_tenant ON bank_transaction(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bt_reference ON bank_transaction(reference);
CREATE INDEX IF NOT EXISTS idx_bt_payment ON bank_transaction(payment_id);
CREATE INDEX IF NOT EXISTS idx_bt_external_id ON bank_transaction(external_id);

-- Enable Row Level Security and Create Tenant Isolation Policy
ALTER TABLE bank_transaction ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'bank_transaction' AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON bank_transaction FOR ALL TO frogpay_app
        USING (
            tenant_id = current_setting('app.current_tenant_id', true)::uuid
            OR current_setting('app.global_access', true)::boolean = true
        )
        WITH CHECK (
            tenant_id = current_setting('app.current_tenant_id', true)::uuid
            OR current_setting('app.global_access', true)::boolean = true
        );
    END IF;
END $$;
