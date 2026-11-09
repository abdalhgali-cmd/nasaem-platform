// T15: look-alike OCR confusions in the MRZ are repaired per field, and a
// result is still accepted only when every check digit verifies. Fictitious
// ICAO-style sample data; no real passport.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parsePassportMrzText, repairMrzLines } from "../src/modules/passport-ocr/passport-ocr.service.js";

const WEIGHTS = [7, 3, 1];
function check(text) {
  const value = (c) => (c === "<" ? 0 : /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55);
  return String([...text].reduce((sum, c, i) => sum + value(c) * WEIGHTS[i % 3], 0) % 10);
}
function build({ number = "L898902C3", dob = "740812", sex = "F", expiry = "301231", country = "SDN" } = {}) {
  const line1 = `P<${country}ERIKSSON<<ANNA<MARIA`.padEnd(44, "<");
  const personal = "ZE184226B<<<<<";
  const body = `${number}${check(number)}${country}${dob}${check(dob)}${sex}${expiry}${check(expiry)}${personal}${check(personal)}`;
  const line2 = body + check(`${number}${check(number)}${dob}${check(dob)}${expiry}${check(expiry)}${personal}${check(personal)}`);
  assert.equal(line1.length, 44);
  assert.equal(line2.length, 44);
  return [line1, line2];
}
const text = (lines) => `noise above\n${lines.join("\n")}\nnoise below`;

describe("MRZ parsing with repair", () => {
  const [l1, l2] = build();

  test("a clean MRZ parses", () => {
    const result = parsePassportMrzText(text([l1, l2]));
    assert.equal(result.documentNumber, "L898902C3");
    assert.equal(result.surname, "ERIKSSON");
    assert.equal(result.dateOfBirth, "1974-08-12");
  });

  test("look-alike letters in digit fields are repaired (O for 0, I for 1, S for 5, B for 8, Z for 2)", () => {
    const damaged = [...l2];
    damaged[13] = "7"; // keep
    const swap = (i, c) => { damaged[i] = c; };
    swap(14, "4"); // dob 740812 -> 7 4 0 8 1 2
    swap(15, "O"); // 0 -> O
    swap(16, "B"); // 8 -> B
    swap(17, "I"); // 1 -> I
    swap(18, "Z"); // 2 -> Z
    const result = parsePassportMrzText(text([l1, damaged.join("")]));
    assert.ok(result, "repaired");
    assert.equal(result.dateOfBirth, "1974-08-12");
    assert.equal(result.documentNumber, "L898902C3");
  });

  test("a misread personal-number check digit (I for 1) needs the repair; the library alone rejects it", () => {
    const damaged = l2.slice(0, 42) + l2[42].replace("1", "I") + l2.slice(43);
    assert.notEqual(damaged, l2, "the sample really contains the digit 1 there");
    const result = parsePassportMrzText(text([l1, damaged]));
    assert.ok(result);
    assert.equal(result.documentNumber, "L898902C3");
  });

  test("digits misread inside the nationality and the name are repaired too", () => {
    const l1Bad = l1.replace("ANNA", "AN1NA".slice(0, 4)).replace("ERIKSSON", "ERIK55ON");
    const l2Bad = l2.slice(0, 10) + "5DN" + l2.slice(13);
    const result = parsePassportMrzText(text([l1Bad, l2Bad]));
    assert.ok(result);
    assert.equal(result.nationality, "SDN");
    assert.equal(result.surname, "ERIKSSON");
  });

  test("a repair never makes a wrong reading valid: a changed digit fails the check digits", () => {
    const wrong = l2.slice(0, 15) + (l2[15] === "9" ? "1" : String(Number(l2[15]) + 1)) + l2.slice(16);
    assert.equal(parsePassportMrzText(text([l1, wrong])), null);
    const wrongNumber = "X" + l2.slice(1);
    assert.equal(parsePassportMrzText(text([l1, wrongNumber])), null);
  });

  test("noise and non-passport text give no result", () => {
    assert.equal(parsePassportMrzText("hello world\nthis is not a passport"), null);
    assert.equal(parsePassportMrzText("OOOOOOOOOOOOOOOOOOOOOOOOOOOO\nIIIIIIIIIIIIIIIIIIIIIIIIIIII"), null);
  });

  test("repairMrzLines only touches typed positions", () => {
    const [r1, r2] = repairMrzLines(l1, l2);
    assert.equal(r1, l1);
    assert.equal(r2, l2);
    assert.equal(repairMrzLines("P<SDNERIK5S<<A", "L898902C3" + "X" .repeat(35))[1].slice(0, 9), "L898902C3", "the document number (alphanumeric) is never rewritten");
  });
});
