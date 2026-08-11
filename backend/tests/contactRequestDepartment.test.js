import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deriveContactRequestDepartment } from "../src/modules/contact-requests/contact-request-department.js";

describe("deriveContactRequestDepartment", () => {
  test("maps every known service string to its department", () => {
    assert.equal(deriveContactRequestDepartment("طيران"), "FLIGHTS");
    assert.equal(deriveContactRequestDepartment("حجز طيران"), "FLIGHTS");
    assert.equal(deriveContactRequestDepartment("عمرة"), "UMRAH");
    assert.equal(deriveContactRequestDepartment("باقة عمرة"), "UMRAH");
    assert.equal(deriveContactRequestDepartment("تأشيرة"), "VISAS");
    assert.equal(deriveContactRequestDepartment("فندق"), "HOTELS_PACKAGES");
    assert.equal(deriveContactRequestDepartment("حجز فندق"), "HOTELS_PACKAGES");
    assert.equal(deriveContactRequestDepartment("باقة سفر شاملة"), "HOTELS_PACKAGES");
    assert.equal(deriveContactRequestDepartment("حجز العبارات"), "FERRY");
  });

  test("duplicate strings from different forms map identically", () => {
    // "تأشيرة" is sent by both visa-request-form.tsx and contact-form.tsx's
    // dropdown — both must resolve to the same department.
    assert.equal(deriveContactRequestDepartment("تأشيرة"), "VISAS");
  });

  test("unmapped or missing service strings return null", () => {
    assert.equal(deriveContactRequestDepartment("استفسار آخر"), null);
    assert.equal(deriveContactRequestDepartment(undefined), null);
    assert.equal(deriveContactRequestDepartment(""), null);
    assert.equal(deriveContactRequestDepartment("   "), null);
    assert.equal(deriveContactRequestDepartment("شيء غير معروف"), null);
  });

  test("trims surrounding whitespace before lookup", () => {
    assert.equal(deriveContactRequestDepartment(" طيران "), "FLIGHTS");
    assert.equal(deriveContactRequestDepartment("\tعمرة\n"), "UMRAH");
  });
});
