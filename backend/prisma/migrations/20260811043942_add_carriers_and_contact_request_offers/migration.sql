-- CreateEnum
CREATE TYPE "CarrierMode" AS ENUM ('AIR', 'SEA');

-- CreateEnum
CREATE TYPE "ContactRequestOfferStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TripLegDirection" AS ENUM ('OUTBOUND', 'RETURN');

-- CreateEnum
CREATE TYPE "TripLegTicketStatus" AS ENUM ('PROPOSED', 'BOOKED', 'TICKETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "CarrierMode" NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequestOffer" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ContactRequestOfferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequestOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLeg" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "direction" "TripLegDirection" NOT NULL DEFAULT 'OUTBOUND',
    "tripNumber" TEXT,
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "ticketStatus" "TripLegTicketStatus" NOT NULL DEFAULT 'PROPOSED',
    "ticketReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripLeg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Carrier_mode_idx" ON "Carrier"("mode");

-- CreateIndex
CREATE INDEX "Carrier_active_idx" ON "Carrier"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_name_mode_key" ON "Carrier"("name", "mode");

-- CreateIndex
CREATE INDEX "ContactRequestOffer_contactRequestId_idx" ON "ContactRequestOffer"("contactRequestId");

-- CreateIndex
CREATE INDEX "ContactRequestOffer_status_idx" ON "ContactRequestOffer"("status");

-- CreateIndex
CREATE INDEX "TripLeg_offerId_idx" ON "TripLeg"("offerId");

-- CreateIndex
CREATE INDEX "TripLeg_carrierId_idx" ON "TripLeg"("carrierId");

-- AddForeignKey
ALTER TABLE "ContactRequestOffer" ADD CONSTRAINT "ContactRequestOffer_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ContactRequestOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripLeg" ADD CONSTRAINT "TripLeg_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
