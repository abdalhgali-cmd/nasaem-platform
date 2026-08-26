-- Add optional customer ownership for Account Center notifications.
-- Existing staff notifications remain unchanged with customerId = NULL.
ALTER TABLE "Notification" ADD COLUMN "customerId" TEXT;

CREATE INDEX "Notification_customerId_idx" ON "Notification"("customerId");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
