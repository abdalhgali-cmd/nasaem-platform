import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGAL_DOCS } from "../www/js/legal-content.js";

test("the app ships real privacy, terms, payment, refund and cancellation texts", () => {
  for (const id of ["privacy", "terms", "payment", "refund", "cancellation"]) {
    const doc = LEGAL_DOCS[id];
    assert.ok(doc?.title && doc.intro && doc.sections.length >= 2, id);
    const text = JSON.stringify(doc);
    assert.ok(!/قيد الإدخال|سيُنشر|placeholder|lorem/i.test(text), `${id} must not be a placeholder`);
  }
});

test("web and app legal texts are identical (single source of wording)", () => {
  const web = readFileSync(new URL("../../web/src/lib/legal-content.ts", import.meta.url), "utf8");
  const json = web.slice(web.indexOf("= {", web.indexOf("LEGAL_DOCS")) + 2, web.lastIndexOf("};") + 1);
  assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(LEGAL_DOCS)));
});
