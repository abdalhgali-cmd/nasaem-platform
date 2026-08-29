-- flight_bookings/flight_inventory/flight_bank_accounts are managed by
-- hand-written SQL and have no Prisma model, so `prisma migrate dev`
-- naturally proposed DROP TABLE/DROP CONSTRAINT for them here (Prisma's
-- diff treats "no model" as "shouldn't exist") — removed by hand, same as
-- prior instances of this (see 20260823132043's migration.sql and
-- tests/migrationIntegrity.test.js). Those tables and their FKs are left
-- untouched by this migration.

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordResetCode" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ALTER COLUMN "passportNo" DROP NOT NULL,
ALTER COLUMN "nationality" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(12,2),
ADD COLUMN     "discountType" "CouponDiscountType",
ADD COLUMN     "discountValue" DECIMAL(12,2),
ADD COLUMN     "originalAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "usageLimit" INTEGER,
    "usageLimitPerCustomer" INTEGER DEFAULT 1,
    "minOrderAmount" DECIMAL(12,2),
    "serviceId" TEXT,
    "visaTypeId" TEXT,
    "newCustomersOnly" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_idx" ON "Coupon"("active");

-- CreateIndex
CREATE INDEX "Coupon_expiryDate_idx" ON "Coupon"("expiryDate");

-- CreateIndex
CREATE INDEX "Coupon_serviceId_idx" ON "Coupon"("serviceId");

-- CreateIndex
CREATE INDEX "Coupon_visaTypeId_idx" ON "Coupon"("visaTypeId");

-- CreateIndex
CREATE INDEX "Coupon_customerId_idx" ON "Coupon"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_orderId_key" ON "CouponUsage"("orderId");

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_idx" ON "CouponUsage"("couponId");

-- CreateIndex
CREATE INDEX "CouponUsage_customerId_idx" ON "CouponUsage"("customerId");

-- CreateIndex
CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_visaTypeId_fkey" FOREIGN KEY ("visaTypeId") REFERENCES "VisaType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
