ALTER TABLE "payment"
ADD COLUMN "qr_payload" TEXT,
ADD COLUMN "expires_at" TIMESTAMPTZ(6);
