-- Guest-first mobile: idempotent submissions + customer message delivery log.
-- Additive only. Rollback:
--   DROP TABLE "CustomerMessageDelivery";
--   DROP INDEX "ContactRequest_submissionKey_key";
--   ALTER TABLE "ContactRequest" DROP COLUMN "submissionKey";
ALTER TABLE "ContactRequest" ADD COLUMN "submissionKey" TEXT;
CREATE UNIQUE INDEX "ContactRequest_submissionKey_key" ON "ContactRequest"("submissionKey");

CREATE TABLE "CustomerMessageDelivery" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMessageDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerMessageDelivery_contactRequestId_kind_channel_key" ON "CustomerMessageDelivery"("contactRequestId", "kind", "channel");
CREATE INDEX "CustomerMessageDelivery_status_idx" ON "CustomerMessageDelivery"("status");

ALTER TABLE "CustomerMessageDelivery"
ADD CONSTRAINT "CustomerMessageDelivery_contactRequestId_fkey"
FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
