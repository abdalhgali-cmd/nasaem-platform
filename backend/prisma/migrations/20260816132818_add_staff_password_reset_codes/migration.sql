-- CreateTable
CREATE TABLE "StaffPasswordResetCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPasswordResetCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffPasswordResetCode_userId_idx" ON "StaffPasswordResetCode"("userId");

-- CreateIndex
CREATE INDEX "StaffPasswordResetCode_expiresAt_idx" ON "StaffPasswordResetCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "StaffPasswordResetCode" ADD CONSTRAINT "StaffPasswordResetCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
