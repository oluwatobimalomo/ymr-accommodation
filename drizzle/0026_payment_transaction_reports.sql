CREATE INDEX IF NOT EXISTS "payment_transactions_created_at_idx" ON "payment_transactions" USING btree ("created_at");
