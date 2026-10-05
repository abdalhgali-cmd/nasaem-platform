import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MAX_UPLOAD_BYTES, effectiveMimeType, validateUploadFile } from "../src/utils/uploadRules";

describe("validateUploadFile", () => {
  test("accepts JPEG, PNG, WEBP and PDF within the size limit", () => {
    for (const [name, mimeType] of [["a.jpg", "image/jpeg"], ["b.png", "image/png"], ["c.webp", "image/webp"], ["d.pdf", "application/pdf"]] as const) {
      assert.equal(validateUploadFile({ name, mimeType, size: 1000 }), null, name);
    }
  });

  test("rejects unsupported types", () => {
    for (const [name, mimeType] of [["a.exe", "application/x-msdownload"], ["b.html", "text/html"], ["c.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["d.txt", "text/plain"]] as const) {
      assert.match(validateUploadFile({ name, mimeType, size: 10 }) ?? "", /نوع الملف/, name);
    }
  });

  test("rejects files over 10 MB, accepts exactly 10 MB", () => {
    assert.match(validateUploadFile({ name: "a.pdf", mimeType: "application/pdf", size: MAX_UPLOAD_BYTES + 1 }) ?? "", /حجم الملف/);
    assert.equal(validateUploadFile({ name: "a.pdf", mimeType: "application/pdf", size: MAX_UPLOAD_BYTES }), null);
  });

  test("a requirement's own smaller limit wins, but never exceeds the server's 10 MB", () => {
    assert.match(validateUploadFile({ name: "a.jpg", mimeType: "image/jpeg", size: 3 * 1024 * 1024 }, { maxBytes: 2 * 1024 * 1024 }) ?? "", /2 ميغابايت/);
    assert.match(validateUploadFile({ name: "a.jpg", mimeType: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 }, { maxBytes: 50 * 1024 * 1024 }) ?? "", /10 ميغابايت/);
  });

  test("a requirement can restrict the allowed types", () => {
    const only = { allowedTypes: ["image/jpeg", "image/png"] };
    assert.match(validateUploadFile({ name: "a.pdf", mimeType: "application/pdf", size: 10 }, only) ?? "", /نوع الملف/);
    assert.equal(validateUploadFile({ name: "a.jpg", mimeType: "image/jpeg", size: 10 }, only), null);
  });

  test("falls back to the extension when the picker reports no or a generic MIME type", () => {
    assert.equal(effectiveMimeType({ name: "scan.JPG", mimeType: null }), "image/jpeg");
    assert.equal(effectiveMimeType({ name: "ticket.pdf", mimeType: "application/octet-stream" }), "application/pdf");
    assert.equal(effectiveMimeType({ name: "mystery", mimeType: undefined }), null);
    assert.equal(validateUploadFile({ name: "mystery", mimeType: null, size: 10 }) !== null, true);
  });

  test("rejects an empty file", () => {
    assert.match(validateUploadFile({ name: "a.pdf", mimeType: "application/pdf", size: 0 }) ?? "", /فارغ/);
  });
});
