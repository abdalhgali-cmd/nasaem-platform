-- Links a Notification to the ContactRequest it belongs to so the
-- customer app can open the relevant request directly.
ALTER TABLE "Notification" ADD COLUMN "contactRequestId" TEXT;

CREATE INDEX "Notification_contactRequestId_idx" ON "Notification"("contactRequestId");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_contactRequestId_fkey"
FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
