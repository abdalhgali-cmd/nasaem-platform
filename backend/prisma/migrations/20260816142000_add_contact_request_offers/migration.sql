-- CreateTable
CREATE TABLE "ContactRequestOffer" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequestOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequestOffer_contactRequestId_idx" ON "ContactRequestOffer"("contactRequestId");

-- CreateIndex
CREATE INDEX "ContactRequestOffer_createdByUserId_idx" ON "ContactRequestOffer"("createdByUserId");

-- AddForeignKey
ALTER TABLE "ContactRequestOffer" ADD CONSTRAINT "ContactRequestOffer_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequestOffer" ADD CONSTRAINT "ContactRequestOffer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN "selectedOfferId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContactRequest_selectedOfferId_key" ON "ContactRequest"("selectedOfferId");

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_selectedOfferId_fkey" FOREIGN KEY ("selectedOfferId") REFERENCES "ContactRequestOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
