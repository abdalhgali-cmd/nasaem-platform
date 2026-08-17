-- CreateEnum
CREATE TYPE "ContactRequestDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ContactRequestDocument" (
    "id" TEXT NOT NULL,
    "contactRequestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "ContactRequestDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequestDocument_contactRequestId_idx" ON "ContactRequestDocument"("contactRequestId");

-- CreateIndex
CREATE INDEX "ContactRequestDocument_status_idx" ON "ContactRequestDocument"("status");

-- CreateIndex
CREATE INDEX "ContactRequestDocument_reviewedByUserId_idx" ON "ContactRequestDocument"("reviewedByUserId");

-- AddForeignKey
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "ContactRequestDocument_contactRequestId_fkey" FOREIGN KEY ("contactRequestId") REFERENCES "ContactRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequestDocument" ADD CONSTRAINT "ContactRequestDocument_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
