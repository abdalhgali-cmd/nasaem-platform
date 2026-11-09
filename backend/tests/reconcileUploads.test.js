// T09: the upload reconciliation report is read-only and conservative.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listFiles, reconcile } from "../src/scripts/reconcile-uploads.js";

const HOUR = 3600 * 1000;
const NOW = Date.UTC(2026, 10, 8, 12);
const file = (rel, ageHours) => ({ rel, size: 10, mtimeMs: NOW - ageHours * HOUR });

describe("reconcile()", () => {
  test("reports only unreferenced files older than the minimum age", () => {
    const report = reconcile({
      files: [file("contact-request-documents/kept.pdf", 100), file("contact-request-documents/old-orphan.pdf", 50), file("contact-request-documents/fresh-orphan.pdf", 1), file("contact-request-deliverables/d-orphan.pdf", 30)],
      referenced: ["contact-request-documents/kept.pdf"],
      now: NOW,
    });
    assert.deepEqual(report.orphans.map((o) => o.path).sort(), ["contact-request-deliverables/d-orphan.pdf", "contact-request-documents/old-orphan.pdf"]);
    assert.deepEqual(report.missing, []);
  });

  test("a referenced file is never an orphan; windows-style stored paths match", () => {
    const report = reconcile({ files: [file("contact-request-documents/a.pdf", 500)], referenced: ["contact-request-documents\\a.pdf"], now: NOW });
    assert.equal(report.orphans.length, 0);
  });

  test("database rows whose file is gone are listed as missing; other folders are ignored", () => {
    const report = reconcile({ files: [], referenced: ["contact-request-documents/gone.pdf", "documents/elsewhere.pdf"], now: NOW });
    assert.deepEqual(report.missing, ["contact-request-documents/gone.pdf"]);
  });
});

describe("listFiles()", () => {
  test("reads only the two watched folders and changes nothing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "recon-"));
    try {
      fs.mkdirSync(path.join(root, "contact-request-documents"));
      fs.mkdirSync(path.join(root, "documents"));
      fs.writeFileSync(path.join(root, "contact-request-documents", "a.pdf"), "x");
      fs.writeFileSync(path.join(root, "documents", "b.pdf"), "x");
      const files = listFiles(root);
      assert.deepEqual(files.map((f) => f.rel), ["contact-request-documents/a.pdf"]);
      assert.equal(fs.existsSync(path.join(root, "contact-request-documents", "a.pdf")), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
