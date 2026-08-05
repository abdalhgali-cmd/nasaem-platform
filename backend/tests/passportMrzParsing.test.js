import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parsePassportMrzText } from "../src/modules/passport-ocr/passport-ocr.service.js";

// A synthetic but fully checksum-valid TD3 (passport) MRZ, built by hand
// with the ICAO 7-3-1 check-digit algorithm — not a real document.
const VALID_LINE_1 = "P<SDNMOHAMED<<AHMED<<<<<<<<<<<<<<<<<<<<<<<<<";
const VALID_LINE_2 = "SD12345673SDN9005156M3001019<<<<<<<<<<<<<<06";

describe("parsePassportMrzText", () => {
  test("extracts fields from a clean, well-formed MRZ", () => {
    const result = parsePassportMrzText(`${VALID_LINE_1}\n${VALID_LINE_2}`);

    assert.ok(result);
    assert.equal(result.documentNumber, "SD1234567");
    assert.equal(result.surname, "MOHAMED");
    assert.equal(result.givenNames, "AHMED");
    assert.equal(result.nationality, "SDN");
    assert.equal(result.issuingCountry, "SDN");
    assert.equal(result.sex, "male");
    assert.equal(result.dateOfBirth, "1990-05-15");
    assert.equal(result.expirationDate, "2030-01-01");
  });

  test("finds the MRZ even with unrelated OCR noise around it", () => {
    const noisy = [
      "REPUBLIC OF SUDAN PASSPORT",
      "Surname MOHAMED Given Names AHMED",
      "",
      VALID_LINE_1,
      VALID_LINE_2,
    ].join("\n");

    const result = parsePassportMrzText(noisy);
    assert.ok(result);
    assert.equal(result.documentNumber, "SD1234567");
  });

  test("reconstructs a line missing trailing '<' filler (common OCR loss)", () => {
    // OCR frequently drops some of a long trailing run of "<" characters —
    // this is real recognition behavior, not a hypothetical (see
    // passportOcr.test.js). The dropped filler carries no information, so
    // the truncated line should still parse correctly once re-padded.
    const truncatedLine1 = "P<SDNMOHAMED<<AHMED<<<<<<";
    const result = parsePassportMrzText(`${truncatedLine1}\n${VALID_LINE_2}`);

    assert.ok(result);
    assert.equal(result.documentNumber, "SD1234567");
    assert.equal(result.surname, "MOHAMED");
  });

  test("returns null for text with no MRZ at all", () => {
    const result = parsePassportMrzText("just some random unrelated text\nwith multiple lines\nno MRZ here");
    assert.equal(result, null);
  });

  test("returns null for an empty string", () => {
    assert.equal(parsePassportMrzText(""), null);
  });

  test("returns null when a digit is corrupted (checksum no longer valid)", () => {
    // Flip one digit in the document number — every dependent check digit
    // now fails, so this must NOT come back as a confident (if wrong) guess.
    const corruptedLine2 = "SD12345683SDN9005156M3001019<<<<<<<<<<<<<<06";
    const result = parsePassportMrzText(`${VALID_LINE_1}\n${corruptedLine2}`);
    assert.equal(result, null);
  });
});
