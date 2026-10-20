-- Vencimiento del plan Premium (simulación de ciclo de facturación de 1 mes).
-- NULL = sin vencimiento (plan Free o premium recién cambiado que aún no expira).
ALTER TABLE "tenant" ADD COLUMN "plan_expires_at" TIMESTAMPTZ(6);
