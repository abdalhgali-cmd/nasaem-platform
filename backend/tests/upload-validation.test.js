import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import request from "supertest";
import {
  detectMimeTypeFromSignature,
  uploadContactRequestDocument,
} from "../src/middleware/upload.middleware.js";
import { UPLOAD_ROOT, resolveStoredUploadPath } from "../src/config/uploadRoot.js";

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

  test("the real middleware writes a valid file and exposes the disk-storage contract", async () => {
    const app = express();
    let storedPath;
    app.post("/upload", uploadContactRequestDocument, (req, res) => {
      storedPath = req.file.path;
      res.json({ filename: req.file.filename, mimeType: req.file.mimetype });
    });

    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        filename: "passport.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.mimeType, "image/jpeg");
    assert.match(response.body.filename, /\.jpg$/);
    assert.ok(storedPath);
    await fs.unlink(storedPath);
  });

  test("the real middleware rejects spoofed content despite an allowed declared MIME", async () => {
    const app = express();
    app.post("/upload", uploadContactRequestDocument, (req, res) => res.sendStatus(204));
    app.use((error, req, res, next) => {
      void req;
      void next;
      res.status(400).json({ message: error.message });
    });

    const response = await request(app)
      .post("/upload")
      .attach("file", Buffer.from([0x4d, 0x5a, 0x90, 0x00]), {
        filename: "passport.jpg",
        contentType: "image/jpeg",
      });

    assert.equal(response.status, 400);
    assert.match(response.body.message, /Unsupported file type/);
  });
});

describe("stored upload path compatibility", () => {
  test("resolves the current relative-path contract", () => {
    assert.equal(
      resolveStoredUploadPath("documents/passport.pdf"),
      path.join(UPLOAD_ROOT, "documents", "passport.pdf"),
    );
  });

  test("maps legacy uploads-prefixed and absolute upload paths onto the configured root", () => {
    const expected = path.join(UPLOAD_ROOT, "contact-request-documents", "passport.jpg");
    assert.equal(resolveStoredUploadPath("uploads/contact-request-documents/passport.jpg"), expected);
    assert.equal(resolveStoredUploadPath("/app/uploads/contact-request-documents/passport.jpg"), expected);
  });

  test("rejects traversal and unrelated absolute paths", () => {
    assert.throws(() => resolveStoredUploadPath("../secrets.txt"), /outside UPLOAD_ROOT/);
    assert.throws(() => resolveStoredUploadPath("/etc/passwd"), /outside UPLOAD_ROOT/);
  });
});
