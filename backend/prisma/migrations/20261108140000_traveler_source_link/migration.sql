-- Additive: an explicit link from a copied traveler (Umrah ticket inquiry) to
-- the pilgrim it was copied from. Nullable; existing rows stay unlinked.
ALTER TABLE "Traveler" ADD COLUMN "sourceTravelerId" TEXT;
CREATE INDEX "Traveler_sourceTravelerId_idx" ON "Traveler"("sourceTravelerId");
ALTER TABLE "Traveler" ADD CONSTRAINT "Traveler_sourceTravelerId_fkey" FOREIGN KEY ("sourceTravelerId") REFERENCES "Traveler"("id") ON DELETE SET NULL ON UPDATE CASCADE;
