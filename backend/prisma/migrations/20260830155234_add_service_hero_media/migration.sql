-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "heroImageKey" TEXT,
ADD COLUMN     "heroImageMobileKey" TEXT,
ADD COLUMN     "motionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motionVideoKey" TEXT;
