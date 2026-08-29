-- Adds an optional supplierId/supplierCost to OrderItem for financial
-- reporting (revenue/paid/outstanding/supplier cost/gross profit, only
-- ever labeled "profit" when a cost is actually on record — see
-- finance.service.js). Purely additive: two new nullable columns, no
-- changes to any existing table.
--
-- NOTE: `prisma migrate dev` again generated DROP TABLE statements for
-- flight_bookings / flight_inventory / flight_bank_accounts here, for the
-- same reason documented in
-- 20260823132043_add_payment_review_status/migration.sql. Removed by hand,
-- never run — see migrationIntegrity.test.js for the automated guard.
-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "supplierCost" DECIMAL(12,2),
ADD COLUMN     "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_supplierId_idx" ON "OrderItem"("supplierId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
