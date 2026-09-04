import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { detectMimeTypeFromSignature } from "../src/middleware/upload.middleware.js";

const signatures = [
  ["JPEG", Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"],
  ["PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png"],
  ["PDF", Buffer.from("%PDF-1.7\n"), "application/pdf"],
  ["WEBP", Buffer.from("RIFFxxxxWEBPpayload"), "image/webp"],
];

describe("upload signature validation", () => {
  for (const [label, buffer, expectedMimeType] of signatures) {
    test(`detects a real ${label} signature`, () => {
      assert.equal(detectMimeTypeFromSignature(buffer), expectedMimeType);
    });
  }

  test("rejects executable bytes even when a client could claim an image MIME type", () => {
    assert.equal(detectMimeTypeFromSignature(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), null);
  });

  test("rejects plain text even when renamed with an allowed extension", () => {
    assert.equal(detectMimeTypeFromSignature(Buffer.from("not really a PDF")), null);
  });

  test("rejects a RIFF file that is not WEBP", () => {
    assert.equal(detectMimeTypeFromSignature(Buffer.from("RIFFxxxxWAVEpayload")), null);
  });
});
