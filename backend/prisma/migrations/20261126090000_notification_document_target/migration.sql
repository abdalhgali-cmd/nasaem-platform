-- Additive only: the requirement (and pilgrim) a correction notification asks
-- the customer to replace, so the notification opens that exact row.
ALTER TABLE "Notification" ADD COLUMN "requirementId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "travelerId" TEXT;
