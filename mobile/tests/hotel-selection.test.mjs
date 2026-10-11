import { test } from "node:test";
import assert from "node:assert/strict";
import { hotelSelection } from "../www/js/hotel-selection.js";

test("hotel stay details are validated before the shared request form", () => {
  const ok = hotelSelection({ city: "مكة المكرمة", checkin: "2026-12-01", checkout: "2026-12-04", rooms: "2", preferences: "قريب من الحرم" }, { today: "2026-10-11" });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.selection.details.type, "HOTEL");
  assert.equal(ok.selection.details.nights, 3);
  assert.equal(ok.selection.details.rooms, 2);
  assert.match(ok.selection.summary, /3 ليالٍ/);
  assert.match(ok.selection.summary, /قريب من الحرم/);

  assert.ok(hotelSelection({ city: "", checkin: "", checkout: "", rooms: "1" }).problems.length >= 3);
  assert.deepEqual(hotelSelection({ city: "جدة", checkin: "2026-12-04", checkout: "2026-12-04", rooms: "1" }).problems, ["تاريخ الخروج يجب أن يكون بعد تاريخ الدخول."]);
  assert.deepEqual(hotelSelection({ city: "جدة", checkin: "2026-01-01", checkout: "2026-01-02", rooms: "1" }, { today: "2026-10-11" }).problems, ["تاريخ الدخول في الماضي."]);
  assert.deepEqual(hotelSelection({ city: "جدة", checkin: "2026-12-01", checkout: "2026-12-02", rooms: "0" }).problems, ["عدد الغرف بين 1 و10."]);
  assert.match(hotelSelection({ city: "جدة", checkin: "2026-12-01", checkout: "2026-12-02", rooms: "1" }).selection.summary, /1 ليلة/);
});
