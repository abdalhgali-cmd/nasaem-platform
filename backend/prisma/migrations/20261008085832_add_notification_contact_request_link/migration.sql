-- Links a Notification to the ContactRequest it's about (mirrors the
-- existing optional orderId link) so the customer app can deep-link a
-- notification tap straight to that request instead of only reopening the
-- notification list. Purely additive: existing rows keep
-- contactRequestId = NULL.
ALTER TABLE "Notification" ADD COLUMN "contactRequestId" TEXT;

CREATE INDEX "Notification_contactRequestId_idx" ON "Notification"("contactRequestId");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_contactRequestId_fkey"
FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
