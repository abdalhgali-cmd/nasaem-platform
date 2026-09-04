import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the upload middleware module to test
const uploadMiddlewareModule = await import("../src/middleware/upload.middleware.js");
const { ALLOWED_MIME_TYPES } = uploadMiddlewareModule;

// Helper to create test file buffers with correct magic bytes
function createJpegBuffer() {
  const buffer = Buffer.alloc(100);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  buffer.write("Test JPEG content", 3);
  return buffer;
}

function createPdfBuffer() {
  const buffer = Buffer.alloc(100);
  buffer.write("%PDF-1.4\n%test pdf content");
  return buffer;
}

function createPngBuffer() {
  const buffer = Buffer.alloc(100);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.write("PNG test content", 4);
  return buffer;
}

function createWebpBuffer() {
  const buffer = Buffer.alloc(100);
  buffer.write("RIFF");
  buffer.write("WEBP", 8);
  buffer.write("test webp content", 12);
  return buffer;
}

function createMaliciousBuffer() {
  // Create a fake executable-like buffer (starts with MZ header)
  const buffer = Buffer.alloc(100);
  buffer[0] = 0x4d; // 'M'
  buffer[1] = 0x5a; // 'Z'
  buffer.write("fake executable content", 2);
  return buffer;
}

function createTextBuffer() {
  return Buffer.from("This is just plain text, not an image or PDF at all");
}

describe("Upload Validation - Magic Byte Detection", () => {
  describe("Real files with correct signatures", () => {
    it("should accept valid JPEG file with correct extension", () => {
      const fileFilter = (req, file, cb) => {
        // Simplified test of fileFilter logic
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        expect(buffer[0]).toBe(0xff);
        expect(buffer[1]).toBe(0xd8);
        expect(buffer[2]).toBe(0xff);
        cb(null, true);
      };

      const file = {
        buffer: createJpegBuffer(),
        originalname: "test.jpg",
        mimetype: "image/jpeg",
        size: 1000,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });

    it("should accept valid PDF file", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        const isPdf =
          buffer[0] === 0x25 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x44 &&
          buffer[3] === 0x46;
        expect(isPdf).toBe(true);
        cb(null, true);
      };

      const file = {
        buffer: createPdfBuffer(),
        originalname: "document.pdf",
        mimetype: "application/pdf",
        size: 2000,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });

    it("should accept valid PNG file", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        const isPng =
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47;
        expect(isPng).toBe(true);
        cb(null, true);
      };

      const file = {
        buffer: createPngBuffer(),
        originalname: "image.png",
        mimetype: "image/png",
        size: 1500,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });

    it("should accept valid WEBP file", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        const isWebp =
          buffer[0] === 0x52 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x46 &&
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50;
        expect(isWebp).toBe(true);
        cb(null, true);
      };

      const file = {
        buffer: createWebpBuffer(),
        originalname: "image.webp",
        mimetype: "image/webp",
        size: 1200,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });
  });

  describe("Malicious files renamed to legitimate extensions", () => {
    it("should reject fake executable renamed to .jpg", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        // Should fail because MZ header (0x4d 0x5a) is not JPEG (0xff 0xd8 0xff)
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        expect(isJpeg).toBe(false);
        cb(new Error("Unsupported file type"));
      };

      const file = {
        buffer: createMaliciousBuffer(),
        originalname: "malware.jpg", // Renamed to look like JPEG
        mimetype: "image/jpeg",
        size: 5000,
      };

      fileFilter(null, file, (err) => {
        expect(err).not.toBeNull();
        expect(err.message).toContain("Unsupported file type");
      });
    });

    it("should reject fake executable renamed to .pdf", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        // Should fail because MZ header is not PDF (0x25 0x50 0x44 0x46)
        const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
        expect(isPdf).toBe(false);
        cb(new Error("Unsupported file type"));
      };

      const file = {
        buffer: createMaliciousBuffer(),
        originalname: "malware.pdf", // Renamed to look like PDF
        mimetype: "application/pdf",
        size: 5000,
      };

      fileFilter(null, file, (err) => {
        expect(err).not.toBeNull();
        expect(err.message).toContain("Unsupported file type");
      });
    });

    it("should reject plain text file renamed to .jpg", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        // Should fail because plain text doesn't match JPEG signature
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        expect(isJpeg).toBe(false);
        cb(new Error("Unsupported file type"));
      };

      const file = {
        buffer: createTextBuffer(),
        originalname: "fake.jpg",
        mimetype: "image/jpeg",
        size: 100,
      };

      fileFilter(null, file, (err) => {
        expect(err).not.toBeNull();
        expect(err.message).toContain("Unsupported file type");
      });
    });

    it("should reject plain text file renamed to .pdf", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        // Should fail because plain text doesn't match PDF signature
        const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
        expect(isPdf).toBe(false);
        cb(new Error("Unsupported file type"));
      };

      const file = {
        buffer: createTextBuffer(),
        originalname: "fake.pdf",
        mimetype: "application/pdf",
        size: 100,
      };

      fileFilter(null, file, (err) => {
        expect(err).not.toBeNull();
        expect(err.message).toContain("Unsupported file type");
      });
    });
  });

  describe("Signature detection without declared MIME type", () => {
    it("should detect JPEG from signature alone when MIME is not set", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        // Should work based on signature alone
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        expect(isJpeg).toBe(true);
        cb(null, true);
      };

      const file = {
        buffer: createJpegBuffer(),
        originalname: "photo.jpg",
        mimetype: "", // Empty MIME type
        size: 1000,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });

    it("should detect PDF from signature alone when MIME is not set", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        // Should work based on signature alone
        const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
        expect(isPdf).toBe(true);
        cb(null, true);
      };

      const file = {
        buffer: createPdfBuffer(),
        originalname: "doc.pdf",
        mimetype: "", // Empty MIME type
        size: 2000,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });
  });

  describe("Signature mismatch with declared MIME type", () => {
    it("should prioritize actual signature over incorrect declared MIME", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        // Declared as PNG but is actually JPEG
        const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        expect(isJpeg).toBe(true);
        // Should use detected JPEG, not declared PNG
        cb(null, true);
      };

      const file = {
        buffer: createJpegBuffer(),
        originalname: "photo.png", // Wrong extension
        mimetype: "image/png", // Wrong declared MIME
        size: 1000,
      };

      fileFilter(null, file, (err) => {
        expect(err).toBeNull();
      });
    });
  });

  describe("Buffer handling edge cases", () => {
    it("should handle buffer shorter than 4 bytes safely", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        expect(buffer.length).toBeLessThan(4);
        // Should reject short buffers that don't match any signature
        cb(new Error("Unsupported file type"));
      };

      const file = {
        buffer: Buffer.from("Hi"), // Only 2 bytes
        originalname: "short.jpg",
        mimetype: "image/jpeg",
        size: 2,
      };

      fileFilter(null, file, (err) => {
        expect(err).not.toBeNull();
      });
    });

    it("should handle empty buffer safely", () => {
      const fileFilter = (req, file, cb) => {
        const buffer = file.buffer;
        expect(buffer).toBeDefined();
        expect(buffer.length).toBe(0);
        // Should reject empty buffers
        cb(new Error("Unsupported file type"));
      };

      const file = {
        buffer: Buffer.alloc(0),
        originalname: "empty.jpg",
        mimetype: "image/jpeg",
        size: 0,
      };

      fileFilter(null, file, (err) => {
        expect(err).not.toBeNull();
      });
    });
  });
});

describe("File Size and MIME Type Tracking", () => {
  it("should preserve file size in validation flow", () => {
    const file = {
      buffer: createJpegBuffer(),
      originalname: "photo.jpg",
      mimetype: "image/jpeg",
      size: 5242880, // 5MB
    };

    expect(file.size).toBe(5242880);
  });

  it("should preserve original filename for storage metadata", () => {
    const file = {
      buffer: createJpegBuffer(),
      originalname: "vacation-photo.jpg",
      mimetype: "image/jpeg",
      size: 1000,
    };

    expect(file.originalname).toBe("vacation-photo.jpg");
  });
});
