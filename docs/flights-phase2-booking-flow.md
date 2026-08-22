# Flights Phase 2 — Booking Request Flow

## Scope

This phase connects the existing flight search to the existing customer/order workflow.

1. Customer searches one-way, round-trip, or multi-city flights.
2. Customer selects a result.
3. Customer enters lead contact information and passenger details.
4. The backend creates a flight booking request linked to the existing order/customer records.
5. Admin can review the request and continue the existing quotation/payment workflow.

## Provider boundary

Manual inventory is immediately bookable as a booking request. Trip results remain a provider-search result until Trip credentials and booking/order APIs are supplied. The system must not fake PNRs, ticket numbers, availability confirmation, or payment success.

## Passenger fields

- type: ADULT | CHILD | INFANT
- firstName
- lastName
- dateOfBirth
- gender
- nationality
- passportNumber
- passportIssueDate
- passportExpiryDate
- passportIssuingCountry
- email
- phone

## Booking states

REQUESTED → QUOTED → PAYMENT_PENDING → CONFIRMED → TICKETED → COMPLETED

Operational failure/cancellation states may be added without changing the public search contract.
