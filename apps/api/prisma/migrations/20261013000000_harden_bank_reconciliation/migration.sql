DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM bank_transaction
        WHERE external_id IS NOT NULL
        GROUP BY tenant_id, external_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce bank deposit idempotency: duplicate (tenant_id, external_id) records exist';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bt_tenant_external_id
    ON bank_transaction(tenant_id, external_id);

ALTER TABLE bank_transaction
    DROP CONSTRAINT IF EXISTS bank_transaction_status_check;

ALTER TABLE bank_transaction
    ADD CONSTRAINT bank_transaction_status_check
    CHECK (status IN ('reconciled', 'amount_mismatch', 'currency_mismatch', 'unmatched'));
