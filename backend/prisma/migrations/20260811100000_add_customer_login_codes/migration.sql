-- CreateTable
CREATE TABLE "CustomerLoginCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLoginCode_phone_idx" ON "CustomerLoginCode"("phone");

-- CreateIndex
CREATE INDEX "CustomerLoginCode_expiresAt_idx" ON "CustomerLoginCode"("expiresAt");
