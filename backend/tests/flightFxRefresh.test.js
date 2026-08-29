import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { loginAsSuperAdmin } from "./helpers/api.js";

const originalRate = 300000;

describe("flight FX refresh", () => {
  test("recalculates stored flight priceSdg without changing original price", async () => {
    const admin = await loginAsSuperAdmin();
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

    const currentRatesRes = await admin.get("/api/flights/admin/rates");
    assert.equal(currentRatesRes.status, 200);
    const previousRates = currentRatesRes.body.data;

    try {
      const createRes = await admin.post("/api/flights").send({
        airline: "TARCO",
        flightNumber: `FX${suffix.slice(-5)}`,
        originCode: "PZU",
        originName: "Port Sudan",
        destinationCode: "JED",
        destinationName: "Jeddah",
        departureAt: "2026-09-20T08:00:00+02:00",
        arrivalAt: "2026-09-20T11:00:00+02:00",
        stops: 0,
        cabin: "Economy",
        price: 100,
        currency: "USD",
        availableSeats: 10,
      });
      assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
      const flightId = createRes.body.data.id;

      const fxRes = await admin.patch("/api/flights/admin/rates").send({
        USD: originalRate,
        SAR: previousRates.SAR,
        AED: previousRates.AED,
        EGP: previousRates.EGP,
      });
      assert.equal(fxRes.status, 200, JSON.stringify(fxRes.body));

      // Looked up directly by id rather than through the paginated
      // GET /api/flights?limit=100 list: flight_inventory is shared,
      // unbounded, and written to concurrently by other test files'
      // processes, so this specific row isn't guaranteed to land within
      // the first 100 by departure_at — a direct row fetch is what this
      // test actually needs (confirm this one row's priceSdg), and is
      // robust regardless of how many other flights exist at the time.
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM flight_inventory WHERE id = $1`, flightId);
      const flight = rows[0];
      assert.ok(flight);
      assert.equal(Number(flight.price), 100);
      assert.equal(Number(flight.fx_rate_to_sdg), originalRate);
      assert.equal(Number(flight.price_sdg), 100 * originalRate);
    } finally {
      await admin.patch("/api/flights/admin/rates").send(previousRates);
      await prisma.$executeRawUnsafe(`DELETE FROM flight_inventory WHERE flight_number = $1`, `FX${suffix.slice(-5)}`);
    }
  });
});
