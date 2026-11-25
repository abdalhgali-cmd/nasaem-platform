// The customer reads one Arabic sentence for partial issuance on the website,
// in the app and in the progress steps (umrah-visa-count.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { visaCountText } from "../src/modules/umrah/umrah-visa-count.js";

test("partial issuance reads correctly for every count", () => {
  assert.equal(visaCountText(1, 2), "صدرت تأشيرة واحدة من أصل تأشيرتين.");
  assert.equal(visaCountText(2, 3), "صدرت تأشيرتان من أصل 3 تأشيرات.");
  assert.equal(visaCountText(1, 3), "صدرت تأشيرة واحدة من أصل 3 تأشيرات.");
  assert.equal(visaCountText(5, 12), "صدرت 5 تأشيرات من أصل 12 تأشيرة.");
  assert.equal(visaCountText(11, 12), "صدرت 11 تأشيرة من أصل 12 تأشيرة.");
});

test("none, one and all", () => {
  assert.equal(visaCountText(0, 1), "لم تصدر التأشيرة بعد.");
  assert.equal(visaCountText(0, 2), "لم تصدر أي تأشيرة بعد من أصل تأشيرتين.");
  assert.equal(visaCountText(1, 1), "صدرت التأشيرة.");
  assert.equal(visaCountText(2, 2), "صدرت جميع التأشيرات (تأشيرتان).");
  assert.equal(visaCountText(3, 3), "صدرت جميع التأشيرات (3 تأشيرات).");
  assert.equal(visaCountText(0, 0), "");
});
