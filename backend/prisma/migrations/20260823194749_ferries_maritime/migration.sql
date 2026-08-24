-- Platform 3.0 Phase 9: new FerryOperator/FerrySchedule tables so an
-- admin can manage ferry operators/routes/sailings instead of the
-- frontend hardcoding them.
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the new tables below are real.

-- CreateTable
CREATE TABLE "FerryOperator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "logoKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FerryOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FerrySchedule" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "departureTime" TEXT,
    "arrivalTime" TEXT,
    "durationMinutes" INTEGER,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FerrySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FerryOperator_active_idx" ON "FerryOperator"("active");

-- CreateIndex
CREATE INDEX "FerryOperator_sortOrder_idx" ON "FerryOperator"("sortOrder");

-- CreateIndex
CREATE INDEX "FerrySchedule_operatorId_idx" ON "FerrySchedule"("operatorId");

-- CreateIndex
CREATE INDEX "FerrySchedule_active_idx" ON "FerrySchedule"("active");

-- CreateIndex
CREATE INDEX "FerrySchedule_travelDate_idx" ON "FerrySchedule"("travelDate");

-- CreateIndex
CREATE INDEX "FerrySchedule_sortOrder_idx" ON "FerrySchedule"("sortOrder");

-- AddForeignKey
ALTER TABLE "FerrySchedule" ADD CONSTRAINT "FerrySchedule_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "FerryOperator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
