CREATE TABLE "flight_inventory" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "airline_name" TEXT NOT NULL,
  "flight_number" TEXT NOT NULL,
  "origin_code" TEXT,
  "origin_name" TEXT NOT NULL,
  "destination_code" TEXT,
  "destination_name" TEXT NOT NULL,
  "departure_at" TIMESTAMP(3) NOT NULL,
  "arrival_at" TIMESTAMP(3) NOT NULL,
  "duration_minutes" INTEGER,
  "stops" INTEGER NOT NULL DEFAULT 0,
  "baggage" TEXT,
  "cabin" TEXT,
  "price" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "fx_rate_to_sdg" DECIMAL(18,6),
  "price_sdg" DECIMAL(16,2),
  "available_seats" INTEGER,
  "external_ref" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flight_inventory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "flight_inventory_route_date_idx" ON "flight_inventory" ("origin_code", "destination_code", "departure_at");
CREATE INDEX "flight_inventory_route_name_date_idx" ON "flight_inventory" ("origin_name", "destination_name", "departure_at");
CREATE INDEX "flight_inventory_source_idx" ON "flight_inventory" ("source");
CREATE INDEX "flight_inventory_active_idx" ON "flight_inventory" ("active");

INSERT INTO "Setting" ("id", "key", "value", "createdAt", "updatedAt")
VALUES
  ('fx_usd_sdg', 'FX_USD_SDG', '0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx_sar_sdg', 'FX_SAR_SDG', '0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx_aed_sdg', 'FX_AED_SDG', '0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fx_egp_sdg', 'FX_EGP_SDG', '0', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
