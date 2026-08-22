CREATE TYPE "FlightBookingStatus" AS ENUM ('REQUESTED','RESERVATION_PENDING','PROVISIONAL_TICKET','PAYMENT_PENDING','PAYMENT_UNDER_REVIEW','PAYMENT_CONFIRMED','FINAL_TICKET_ISSUED','CANCELLED');

CREATE TABLE "flight_bookings" (
  "id" TEXT PRIMARY KEY,
  "booking_number" TEXT NOT NULL UNIQUE,
  "order_id" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE CASCADE,
  "customer_id" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE RESTRICT,
  "flight_id" TEXT NOT NULL,
  "status" "FlightBookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "passengers" JSONB NOT NULL,
  "provisional_ticket_path" TEXT,
  "provisional_ticket_name" TEXT,
  "provisional_ticket_uploaded_at" TIMESTAMP(3),
  "payment_receipt_path" TEXT,
  "payment_receipt_name" TEXT,
  "payment_receipt_uploaded_at" TIMESTAMP(3),
  "payment_review_note" TEXT,
  "final_ticket_path" TEXT,
  "final_ticket_name" TEXT,
  "final_ticket_uploaded_at" TIMESTAMP(3),
  "bank_account_key" TEXT,
  "bank_account_label" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'SDG',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "flight_bookings_status_idx" ON "flight_bookings"("status");
CREATE INDEX "flight_bookings_customer_id_idx" ON "flight_bookings"("customer_id");
CREATE INDEX "flight_bookings_order_id_idx" ON "flight_bookings"("order_id");

CREATE TABLE "flight_passengers" (
  "id" TEXT PRIMARY KEY,
  "flight_booking_id" TEXT NOT NULL REFERENCES "flight_bookings"("id") ON DELETE CASCADE,
  "passenger_index" INTEGER NOT NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "birth_date" TIMESTAMP(3),
  "gender" TEXT,
  "nationality" TEXT,
  "passport_no" TEXT,
  "passport_issue_date" TIMESTAMP(3),
  "passport_expiry_date" TIMESTAMP(3),
  "passport_issue_country" TEXT,
  "passenger_type" TEXT NOT NULL DEFAULT 'ADULT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flight_passengers_booking_index_key" UNIQUE ("flight_booking_id","passenger_index")
);

CREATE TABLE "flight_bank_accounts" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "bank_name" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
