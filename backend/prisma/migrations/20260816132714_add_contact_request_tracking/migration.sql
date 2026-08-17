-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "phoneNormalized" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ContactRequestLoginCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactRequestLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRequestLoginCode_phone_idx" ON "ContactRequestLoginCode"("phone");

-- CreateIndex
CREATE INDEX "ContactRequest_phoneNormalized_idx" ON "ContactRequest"("phoneNormalized");
