import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pickArabicNameSuggestion } from "../src/modules/passport-ocr/passport-ocr.service.js";

describe("pickArabicNameSuggestion", () => {
  test("picks the Arabic-script line over Latin/MRZ noise", () => {
    const raw = [
      "REPUBLIC OF SUDAN",
      "P<SDNMOHAMED<<AHMED<<<<<<<<<<<<<<<<<<<<<<<<<",
      "محمد أحمد علي إبراهيم",
      "SD12345673SDN9005156M3001019<<<<<<<<<<<<<<06",
    ].join("\n");

    assert.equal(pickArabicNameSuggestion(raw), "محمد أحمد علي إبراهيم");
  });

  test("prefers the Arabic line with the most words when several qualify", () => {
    const raw = ["الجمهورية", "محمد أحمد علي إبراهيم عثمان"].join("\n");

    assert.equal(pickArabicNameSuggestion(raw), "محمد أحمد علي إبراهيم عثمان");
  });

  test("returns null when no line is predominantly Arabic script", () => {
    assert.equal(pickArabicNameSuggestion("REPUBLIC OF SUDAN\nPASSPORT\n1234567890"), null);
  });

  test("returns null for empty or whitespace-only OCR output", () => {
    assert.equal(pickArabicNameSuggestion(""), null);
    assert.equal(pickArabicNameSuggestion("   \n  \n"), null);
  });

  test("ignores short fragments even if Arabic", () => {
    assert.equal(pickArabicNameSuggestion("من\nإلى"), null);
  });
});
