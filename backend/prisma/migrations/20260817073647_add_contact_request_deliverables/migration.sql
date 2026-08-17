-- CreateTable
CREATE TABLE "ContactRequestDeliverable" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequestDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequestDeliverable_contactRequestId_idx" ON "ContactRequestDeliverable"("contactRequestId");

-- CreateIndex
CREATE INDEX "ContactRequestDeliverable_uploadedByUserId_idx" ON "ContactRequestDeliverable"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "ContactRequestDeliverable" ADD CONSTRAINT "ContactRequestDeliverable_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequestDeliverable" ADD CONSTRAINT "ContactRequestDeliverable_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
