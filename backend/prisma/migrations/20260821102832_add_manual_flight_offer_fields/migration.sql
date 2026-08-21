-- CreateEnum
CREATE TYPE "ContactRequestOfferSource" AS ENUM ('MANUAL', 'API');

-- AlterTable
ALTER TABLE "ContactRequestOffer" ADD COLUMN     "flightDetails" JSONB,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerOfferId" TEXT,
ADD COLUMN     "source" "ContactRequestOfferSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "validUntil" TIMESTAMP(3);
