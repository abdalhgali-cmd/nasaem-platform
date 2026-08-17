-- CreateEnum
CREATE TYPE "ContactRequestOutcome" AS ENUM ('COMPLETED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "outcome" "ContactRequestOutcome",
ADD COLUMN     "outcomeNote" TEXT;
