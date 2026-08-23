-- Platform 3.0 Phase 11: new Airport directory table (standalone
-- reference data, not wired into flight_inventory/flight_bookings).
--
-- As with every migration in this project, `prisma migrate dev` also
-- proposed dropping flight_bank_accounts, flight_bookings and
-- flight_inventory (and their FKs) — those tables are managed by raw SQL
-- with no Prisma model, so Prisma always misreads them as removed. This
-- is the same recurring false-positive documented in
-- docs/PLATFORM-3-AUDIT.md; those DROP statements were removed by hand.
-- Only the new Airport table below is real.

-- CreateTable
CREATE TABLE "Airport" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "cityAr" TEXT NOT NULL,
    "cityEn" TEXT,
    "countryAr" TEXT NOT NULL,
    "countryEn" TEXT,
    "iataCode" TEXT,
    "icaoCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Airport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Airport_iataCode_key" ON "Airport"("iataCode");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_icaoCode_key" ON "Airport"("icaoCode");

-- CreateIndex
CREATE INDEX "Airport_active_idx" ON "Airport"("active");
