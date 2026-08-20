-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "intakeData" JSONB,
ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "travelerCount" INTEGER,
ADD COLUMN     "visaTypeId" TEXT;

-- CreateIndex
CREATE INDEX "ContactRequest_serviceId_idx" ON "ContactRequest"("serviceId");

-- CreateIndex
CREATE INDEX "ContactRequest_visaTypeId_idx" ON "ContactRequest"("visaTypeId");

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_visaTypeId_fkey" FOREIGN KEY ("visaTypeId") REFERENCES "VisaType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
