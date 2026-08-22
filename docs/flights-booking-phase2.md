# Flight booking Phase 2

Customer flow:

1. Customer selects a flight and submits passenger/passport details.
2. Agency receives a booking request in the flight booking queue.
3. Employee performs the actual reservation outside the public flow and uploads the provisional ticket.
4. The booking moves to `PAYMENT_PENDING` and the customer can view the provisional ticket and bank account details.
5. Customer uploads the bank-transfer receipt; status becomes `PAYMENT_UNDER_REVIEW`.
6. Authorized staff verifies the receipt and confirms payment; status becomes `PAYMENT_CONFIRMED`.
7. Employee uploads the final ticket; status becomes `FINAL_TICKET_ISSUED` and the linked order is completed.

Trip live booking/PNR remains intentionally outside this phase until Trip provider credentials and commercial approval are available.
