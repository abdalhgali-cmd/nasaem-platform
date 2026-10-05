-- Additive, nullable. Rollback: ALTER TABLE "User" DROP COLUMN "passwordChangedAt";
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
