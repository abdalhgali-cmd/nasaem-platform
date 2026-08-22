CREATE TABLE IF NOT EXISTS flight_bank_accounts (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flight_bookings (
  id TEXT PRIMARY KEY,
  booking_number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES "Order"(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES "Customer"(id) ON DELETE RESTRICT,
  flight_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  passengers JSONB NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SDG',
  provisional_ticket_path TEXT,
  provisional_ticket_name TEXT,
  provisional_ticket_uploaded_at TIMESTAMP,
  payment_receipt_path TEXT,
  payment_receipt_name TEXT,
  payment_receipt_uploaded_at TIMESTAMP,
  payment_review_note TEXT,
  final_ticket_path TEXT,
  final_ticket_name TEXT,
  final_ticket_uploaded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS flight_bookings_status_idx ON flight_bookings(status);
CREATE INDEX IF NOT EXISTS flight_bookings_customer_idx ON flight_bookings(customer_id);
CREATE INDEX IF NOT EXISTS flight_bookings_order_idx ON flight_bookings(order_id);
