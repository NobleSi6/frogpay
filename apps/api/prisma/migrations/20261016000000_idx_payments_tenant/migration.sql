-- ============================================================
-- FrogPay - Sprint 4: Optimización de Índices (TSK-DEV1-402)
-- Asegura p95 < 300 ms en consultas paginadas y filtradas con 10.000+ pagos
-- ============================================================

-- 1. Índice compuesto para tenant y ordenamiento/rango por fecha de creación
CREATE INDEX IF NOT EXISTS idx_payment_tenant_created
  ON payment(tenant_id, created_at DESC);

-- 2. Índice compuesto para tenant y filtro por estado del pago
CREATE INDEX IF NOT EXISTS idx_payment_tenant_status
  ON payment(tenant_id, status);

-- 3. Compatibilidad condicional si la tabla tuviera nombre plural 'payments'
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments') THEN
    CREATE INDEX IF NOT EXISTS idx_payments_tenant_created ON payments(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant_status ON payments(tenant_id, status);
  END IF;
END $$;
