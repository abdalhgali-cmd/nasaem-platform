import "./env.js";
import "./helpers/relaxFlightLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, loginAsSuperAdmin, request, uniqueSuffix } from "./helpers/api.js";

// Security regression suite for the PUBLIC flight-booking endpoints.
//
// Before the fix:
//   * the customer chose the price (amount/currency came from the request body);
//   * customerId / passportNo in the body could attach a booking to an existing
//     customer, and the response disclosed that customer's name/phone/email;
//   * view/upload/download were protected only by booking number + phone number
//     (phone passed in the query string, so it also landed in access logs);
//   * receipt/ticket uploads had no file-type validation and were memory-buffered;
//   * no dedicated rate limit existed on any of these endpoints.
//
// Now: price is computed server-side from the flight inventory; bookings are
// never bound to pre-existing customers by public input; access requires an
// unguessable per-booking token returned once at creation (or a tracking
// session whose verified phone owns the booking); uploads use the shared
// magic-byte validator; abuse is rate-limited.

const PDF = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("1 0 obj<<>>endobj\n%%EOF\n")]);
const PNG = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PRICE_SDG = 1500000;

describe("public flight booking security", () => {
  let admin;
  let flightId;

  before(async () => {
    admin = await loginAsSuperAdmin();
    const flight = await admin.post("/api/flights").send({
      airline: "TARCO",
      flightNumber: `3X${uniqueSuffix().slice(-4)}`,
      originCode: "PZU",
      originName: "Port Sudan",
      destinationCode: "JED",
      destinationName: "Jeddah",
      departureAt: "2026-12-01T08:30:00+02:00",
      arrivalAt: "2026-12-01T11:30:00+02:00",
      stops: 0,
      baggage: "30 KG",
      cabin: "Economy",
      price: PRICE_SDG,
      currency: "SDG",
      availableSeats: 50,
    });
    assert.equal(flight.status, 201, JSON.stringify(flight.body));
    flightId = flight.body.data.id;
    const bank = await admin.post("/api/flight-bookings/admin/bank-accounts").send({
      key: `sec-bank-${uniqueSuffix()}`,
      label: "حساب اختبار",
      bankName: "Test Bank",
      accountNumber: "000111222",
    });
    assert.equal(bank.status, 201, JSON.stringify(bank.body));
  });

  function passenger(passportNo) {
    return { firstName: "Ali", lastName: "Ahmed", passportNo, nationality: "Sudan" };
  }

  async function createBooking(overrides = {}) {
    const phone = overrides.phone || `2499${uniqueSuffix().slice(-8)}`;
    const body = {
      flightIds: [flightId],
      // Legacy web clients still send these; the server must ignore them.
      amount: PRICE_SDG,
      currency: "SDG",
      contact: { fullName: "Public Booker", phone },
      passengers: [passenger(`PB${uniqueSuffix()}`)],
      ...overrides.body,
    };
    const res = await request(app).post("/api/flight-bookings").send(body);
    return { res, phone, body };
  }

  async function bookingWithTicket() {
    const { res, phone } = await createBooking();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const booking = res.body.booking;
    const prov = await admin.post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", PDF(), "prov.pdf");
    assert.equal(prov.status, 200, JSON.stringify(prov.body));
    return { booking, phone, token: res.body.accessToken };
  }

  describe("pricing is server-side", () => {
    test("EXPLOIT: a client-supplied amount/currency is ignored", async () => {
      const { res } = await createBooking({ body: { amount: 1, currency: "USD" } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(Number(res.body.booking.amount), PRICE_SDG);
      assert.equal(res.body.booking.currency, "SDG");
    });

    test("amount scales with the passenger count (prices are per person)", async () => {
      const { res } = await createBooking({ body: { passengers: [passenger(`PB${uniqueSuffix()}`), passenger(`PC${uniqueSuffix()}`)] } });
      assert.equal(res.status, 201);
      assert.equal(Number(res.body.booking.amount), PRICE_SDG * 2);
    });

    test("an unknown or inactive flight id is rejected", async () => {
      const { res } = await createBooking({ body: { flightIds: ["00000000-0000-0000-0000-000000000000"] } });
      assert.equal(res.status, 400);
    });
  });

  describe("no binding to pre-existing customers via public input", () => {
    test("EXPLOIT: customerId / passportNo of an existing customer is not honoured and nothing leaks", async () => {
      const victimPhone = `2499${uniqueSuffix().slice(-8)}`;
      const victimPassport = `VIC${uniqueSuffix()}`;
      const victim = await admin.post("/api/customers").send({
        fullName: "Victim Customer",
        passportNo: victimPassport,
        nationality: "Sudan",
        phone: victimPhone,
        email: "victim@example.com",
      });
      assert.equal(victim.status, 201);

      for (const body of [
        { customerId: victim.body.data.id },
        { contact: { fullName: "Mallory", phone: `2499${uniqueSuffix().slice(-8)}`, passportNo: victimPassport } },
        { passengers: [passenger(victimPassport)] },
      ]) {
        const { res } = await createBooking({ body });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const text = JSON.stringify(res.body);
        assert.ok(!text.includes("Victim Customer"), "victim name must not be disclosed");
        assert.ok(!text.includes(victimPhone), "victim phone must not be disclosed");
        assert.ok(!text.includes("victim@example.com"), "victim email must not be disclosed");
        assert.notEqual(res.body.booking.customer_id, victim.body.data.id, "booking must not attach to the victim record");
      }
    });
  });

  describe("access control", () => {
    test("creation returns an access token once; stored hash is not exposed", async () => {
      const { res } = await createBooking();
      assert.equal(res.status, 201);
      assert.ok(typeof res.body.accessToken === "string" && res.body.accessToken.length >= 32);
      assert.equal(JSON.stringify(res.body).includes("access_token_hash"), false);
    });

    test("EXPLOIT: booking number + phone number alone no longer grants access", async () => {
      const { booking, phone } = await bookingWithTicket();
      const byPhone = await request(app).get(`/api/flight-bookings/public/${booking.booking_number}`).query({ phone });
      assert.ok([401, 403, 404].includes(byPhone.status), `got ${byPhone.status}`);
      const file = await request(app).get(`/api/flight-bookings/${booking.booking_number}/file/provisional`).query({ phone });
      assert.ok([401, 403, 404].includes(file.status), `got ${file.status}`);
    });

    test("the booking token grants access; a wrong or foreign token does not", async () => {
      const a = await bookingWithTicket();
      const b = await bookingWithTicket();
      const ok = await request(app).get(`/api/flight-bookings/public/${a.booking.booking_number}`).set("X-Booking-Token", a.token);
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.booking.booking_number, a.booking.booking_number);
      for (const token of ["nope", b.token, ""]) {
        const bad = await request(app).get(`/api/flight-bookings/public/${a.booking.booking_number}`).set("X-Booking-Token", token);
        assert.ok([401, 404].includes(bad.status), `token ${token ? "foreign" : "empty"} -> ${bad.status}`);
      }
    });

    test("the public view does not expose internal fields", async () => {
      const a = await bookingWithTicket();
      const ok = await request(app).get(`/api/flight-bookings/public/${a.booking.booking_number}`).set("X-Booking-Token", a.token);
      const text = JSON.stringify(ok.body);
      assert.equal(text.includes("access_token_hash"), false);
      assert.equal(text.includes("_path"), false, "storage paths must not leave the server");
    });

    test("ticket download requires the token and is delivered", async () => {
      const a = await bookingWithTicket();
      const denied = await request(app).get(`/api/flight-bookings/${a.booking.booking_number}/file/provisional`);
      assert.ok([401, 404].includes(denied.status));
      const ok = await request(app).get(`/api/flight-bookings/${a.booking.booking_number}/file/provisional`).set("X-Booking-Token", a.token);
      assert.equal(ok.status, 200);
      assert.match(ok.headers["content-disposition"] || "", /attachment/);
    });

    test("a phone-verified tracking session can open its own legacy booking, and only its own", async () => {
      const a = await bookingWithTicket();
      const asTracking = async (phone) => {
        const code = (await request(app).post("/api/tracking/request-code").send({ phone })).body.debugCode;
        const verified = await request(app).post("/api/tracking/verify-code").send({ phone, code });
        assert.equal(verified.status, 200, JSON.stringify(verified.body));
        return verified.body.data.token;
      };
      const owner = await asTracking(a.phone);
      const view = await request(app).get(`/api/flight-bookings/public/${a.booking.booking_number}`).set("Authorization", `Bearer ${owner}`);
      assert.equal(view.status, 200, JSON.stringify(view.body));
      const stranger = await asTracking(`2498${uniqueSuffix().slice(-8)}`);
      const denied = await request(app).get(`/api/flight-bookings/public/${a.booking.booking_number}`).set("Authorization", `Bearer ${stranger}`);
      assert.ok([401, 404].includes(denied.status));
    });
  });

  describe("upload validation", () => {
    test("EXPLOIT: a non-document (text/html/exe) cannot be uploaded as a payment receipt", async () => {
      const a = await bookingWithTicket();
      for (const [name, data] of [
        ["receipt.txt", Buffer.from("plain text")],
        ["receipt.html", Buffer.from("<script>alert(1)</script>")],
        ["receipt.pdf", Buffer.from("MZ\x90\x00 pretend executable renamed to pdf")],
      ]) {
        const res = await request(app)
          .post(`/api/flight-bookings/${a.booking.booking_number}/payment-receipt`)
          .set("X-Booking-Token", a.token)
          .attach("file", data, name);
        assert.equal(res.status, 400, `${name}: ${res.status} ${JSON.stringify(res.body)}`);
      }
    });

    test("a real PDF/PNG receipt is accepted with the token and refused without it", async () => {
      const a = await bookingWithTicket();
      const denied = await request(app).post(`/api/flight-bookings/${a.booking.booking_number}/payment-receipt`).attach("file", PDF(), "r.pdf");
      assert.ok([401, 404].includes(denied.status));
      const ok = await request(app)
        .post(`/api/flight-bookings/${a.booking.booking_number}/payment-receipt`)
        .set("X-Booking-Token", a.token)
        .attach("file", PNG(), "r.png");
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.booking.status, "PAYMENT_UNDER_REVIEW");
    });

    test("oversized uploads are refused", async () => {
      const a = await bookingWithTicket();
      const big = Buffer.concat([PDF(), Buffer.alloc(10 * 1024 * 1024 + 1024)]);
      const res = await request(app)
        .post(`/api/flight-bookings/${a.booking.booking_number}/payment-receipt`)
        .set("X-Booking-Token", a.token)
        .attach("file", big, "big.pdf");
      assert.ok([400, 413].includes(res.status), `got ${res.status}`);
    });

    test("staff ticket uploads are validated too", async () => {
      const { res } = await createBooking();
      const id = res.body.booking.id;
      const bad = await admin.post(`/api/flight-bookings/${id}/provisional-ticket`).attach("file", Buffer.from("not a pdf"), "x.txt");
      assert.equal(bad.status, 400);
      const good = await admin.post(`/api/flight-bookings/${id}/provisional-ticket`).attach("file", PDF(), "x.pdf");
      assert.equal(good.status, 200);
    });
  });
});
