-- Durable customer confirmations: retry schedule for the outbox rows.
-- Additive only. Rollback:
--   DROP INDEX "CustomerMessageDelivery_status_nextAttemptAt_idx";
--   ALTER TABLE "CustomerMessageDelivery" DROP COLUMN "nextAttemptAt";
ALTER TABLE "CustomerMessageDelivery" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
CREATE INDEX "CustomerMessageDelivery_status_nextAttemptAt_idx" ON "CustomerMessageDelivery"("status", "nextAttemptAt");
