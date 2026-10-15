import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAirportCode, airportLabel } from "../www/js/airports.js";

test("an airport is chosen from the directory list or typed as a 3-letter code - nothing else", () => {
  const known = new Map([[airportLabel({ iataCode: "KRT", cityAr: "الخرطوم", nameAr: "مطار الخرطوم" }), "KRT"]]);
  assert.equal(resolveAirportCode("KRT — الخرطوم، مطار الخرطوم", known), "KRT");
  assert.equal(resolveAirportCode("jed", known), "JED");
  assert.equal(resolveAirportCode(" PZU ", new Map()), "PZU");
  assert.equal(resolveAirportCode("الخرطوم", known), null, "a bare city name is not a code");
  assert.equal(resolveAirportCode("JEDDAH", known), null);
  assert.equal(resolveAirportCode("", known), null);
  assert.equal(resolveAirportCode("12", known), null);
});
