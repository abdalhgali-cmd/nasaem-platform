# Flight providers: inventory and readiness (Issue #109)

**Status as of 2026-10-17:** the repository, the environment and the issue history hold no provider agreement, API documentation, sandbox account or credentials for any airline. Every provider is **BLOCKED** for live booking and runs as **REQUEST_ONLY**:
- search shows the agency's own inventory (`flight_inventory`; the existing Sudanese-airline filter);
- staff book with the airline themselves;
- staff upload the provisional and final ticket files by hand (`flight-bookings`).

| Provider | Agreement / API access | Sandbox | Payment and settlement terms | Mode |
|---|---|---|---|---|
| Tarco Aviation | none on record | none | unknown | REQUEST_ONLY (BLOCKED) |
| Badr Airlines | none on record | none | unknown | REQUEST_ONLY (BLOCKED) |
| Sudan Airways (Sudanair) | none on record | none | unknown | REQUEST_ONLY (BLOCKED) |
| NDC aggregator (unnamed) | none on record | none | unknown | REQUEST_ONLY (BLOCKED) |
| Generic `TRIP_API_URL` search (existing) | not configured | — | — | results hidden unless configured; search only, never a booking |

## What exists in code (`backend/src/modules/flight-providers/`)

| File | What it does |
|---|---|
| `provider-registry.js` | The four providers and their mode. **LIVE needs all of:** a reviewed adapter for that provider's real API, `FLIGHT_PROVIDER_<CODE>_URL` + `_TOKEN`, `_ENV=production`, and `_LIVE_APPROVED=yes` set by the owner. `_ENV=sandbox` gives SANDBOX. Anything less is REQUEST_ONLY. No adapter is registered, so all four are REQUEST_ONLY. |
| `offer-normalize.js` | Normalizes and validates one fare offer (rules below). An offer that fails any rule is dropped. |
| `provider-http.js` | The single HTTP path for adapters (behaviour below). |
| `booking-gate.js` | The only way to create a provider PNR (steps below). Issuing and charging stay separate, manual steps. |
| `GET /api/flight-providers/status` | Admin-only readiness view: each provider's mode and reason, with no URLs or credentials. |
| `backend/tests/flightProviders.test.js` | Contract tests against a local mock provider: modes, normalization, timeout, 429, auth and 5xx, no leaks, the gate. |

**Offer rules (`offer-normalize.js`):**
- IATA airport codes and ISO currency codes are required.
- Segments must connect and be in time order; stops = number of segments − 1.
- Cabin codes are mapped to cabin names; baggage is kept only when the provider gives it.
- The total, and a validity time still in the future, are required.
- Passenger-type prices are kept only when the provider priced them in the offer's own currency. Nothing is derived or converted.

**HTTP client (`provider-http.js`):**
- hard timeout;
- 429 is reported with the provider's `Retry-After`;
- 401/403 means auth failure, and 5xx or no reply means provider unavailable;
- errors carry only a code and fixed Arabic text, never the response body, the token or passenger data.

**Booking gate (`booking-gate.js`):**
1. The provider must be LIVE.
2. Only an admin can confirm.
3. The fare must be within its validity time.
4. The provider re-prices it. If the fare is unavailable or the total has changed, the gate stops and the customer must accept the new price before going on.
5. A PNR counts only if the provider returns a valid one.

## What the owner must supply per provider before any adapter is written
1. A signed agreement or written permission to book through the API, plus the settlement method (deposit, BSP or invoice) and who pays.
2. API documentation and a **sandbox** account. An adapter is written and contract-tested against the sandbox first.
3. Fare rules on validity, cancellation and refunds, and which passenger types (adult, child, infant) the API actually prices.
4. Production credentials, stored only in the deployment environment and never in the repository, followed by a separate acceptance test.
5. Explicit approval to set `FLIGHT_PROVIDER_<CODE>_LIVE_APPROVED=yes`.

Until all five are in place, the website and app must keep saying the price is confirmed by staff, and must never promise an instant booking.
