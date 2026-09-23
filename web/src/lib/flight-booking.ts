// Shape of the public flight booking payload returned by the backend's
// flight-bookings module (raw flight_bookings row + derived fields).
export type FlightBankAccount = {
  id: string;
  key: string;
  label: string;
  account_number: string;
  bank_name: string | null;
  active: boolean;
};

export type FlightBooking = {
  id: string;
  booking_number: string;
  status: string;
  statusLabel?: string;
  amount: number | string;
  currency: string;
  passengers?: unknown[];
  flightIds?: string[];
  customer_name?: string | null;
  customer_phone?: string | null;
  provisional_ticket_path?: string | null;
  final_ticket_path?: string | null;
  bankAccounts?: FlightBankAccount[];
};
