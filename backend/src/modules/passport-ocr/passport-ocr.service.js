import fs from "fs/promises";
import path from "path";
import { createWorker } from "tesseract.js";
import { isFeatureEnabled } from "../feature-flags/feature-flags.service.js";
import { parse as parseMrz } from "mrz";

// Vendored locally (backend/ocr-data/eng.traineddata.gz) so OCR works without
// any network access at runtime — see backend/ocr-data/README.md.
const LANG_DATA_PATH = path.resolve("ocr-data");

// MRZ character set is fixed (A-Z, 0-9, filler "<"). Restricting recognition
// to it measurably improves accuracy on the MRZ strip and suppresses noise
// from the rest of the passport page (photo, stamps, local-script name).
const MRZ_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

let workerPromise;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      langPath: LANG_DATA_PATH,
      cachePath: LANG_DATA_PATH,
      gzip: true,
      // tesseract.js's own worker message handler does two independent
      // things on a rejected job (a corrupted/unreadable image, e.g. a bad
      // photo or a non-image file that slipped past the MIME check): it
      // rejects the job's promise (which extractPassportData/
      // maybeRunPassportOcr's try/catch below does correctly catch) AND,
      // with no errorHandler configured, separately `throw`s the same error
      // synchronously from inside its internal message-event callback -
      // completely independent of the awaited promise chain, so no
      // surrounding try/catch can ever catch it. Uncaught, that throw
      // crashes the entire Node process on a single bad upload (verified:
      // a truncated/invalid JPEG reproduces this every time). Supplying
      // this handler is what actually makes "never throws" true; the
      // promise rejection path continues to do the real error handling.
      errorHandler: () => {},
    }).then(async (worker) => {
      await worker.setParameters({ tessedit_char_whitelist: MRZ_CHARSET });
      return worker;
    });
  }
  return workerPromise;
}

// TD1 (id cards) uses 3 lines of 30 chars; TD3 (passports) uses 2 lines of
// 44 chars. We only try line-group sizes relevant to passports (2 lines),
// which is what this feature is scoped to.
//
// Deliberately low: OCR frequently drops some of the trailing "<" filler
// run at the end of an MRZ line (a long run of "<" can visually read as a
// solid rule rather than characters), which loses no real data since it's
// padding — padEnd() below reconstructs it. Requiring only the substantive
// prefix keeps such lines eligible instead of discarding them outright.
const MIN_MRZ_LINE_LENGTH = 20;

function candidateLines(rawText) {
  return rawText
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Z0-9<]/g, ""))
    .filter((line) => line.length >= MIN_MRZ_LINE_LENGTH);
}

function inferFullYear(twoDigitYear, { assumeCurrentCentury }) {
  const now = new Date();
  const currentCentury = Math.floor(now.getFullYear() / 100) * 100;

  if (assumeCurrentCentury) {
    return currentCentury + twoDigitYear;
  }

  // Birth dates: MRZ only carries a 2-digit year, so a value greater than
  // the current 2-digit year almost certainly means "last century".
  const currentTwoDigit = now.getFullYear() % 100;
  return twoDigitYear > currentTwoDigit ? currentCentury - 100 + twoDigitYear : currentCentury + twoDigitYear;
}

function mrzDateToIso(raw, { assumeCurrentCentury }) {
  if (!raw || raw.includes("<") || !/^\d{6}$/.test(raw)) return null;

  const year = inferFullYear(Number(raw.slice(0, 2)), { assumeCurrentCentury });
  const month = raw.slice(2, 4);
  const day = raw.slice(4, 6);
  return `${year}-${month}-${day}`;
}

// Only ever called with a fully checksum-valid parse (see
// parsePassportMrzText), so every field here already passed MRZ validation.
function formatResult(parsed) {
  const f = parsed.fields;

  return {
    documentNumber: f.documentNumber || null,
    surname: f.lastName || null,
    givenNames: f.firstName || null,
    nationality: f.nationality || null,
    issuingCountry: f.issuingState || null,
    sex: f.sex || null,
    dateOfBirth: mrzDateToIso(f.birthDate, { assumeCurrentCentury: false }),
    expirationDate: mrzDateToIso(f.expirationDate, { assumeCurrentCentury: true }),
  };
}

// Tries every adjacent pair of MRZ-looking lines found in the OCR output and
// returns the first one that parses as a fully checksum-valid passport
// (TD3) MRZ. Deliberately strict, not best-effort: an MRZ's check digits
// make accidental validity on non-MRZ text astronomically unlikely, so
// requiring `parsed.valid` is what keeps this from ever handing staff a
// confident-looking but wrong guess (e.g. digits misread from OCR noise)
// instead of correctly reporting "couldn't read it".
export function parsePassportMrzText(rawText) {
  const lines = candidateLines(rawText);

  for (let i = 0; i < lines.length - 1; i++) {
    const line1 = lines[i].padEnd(44, "<").slice(0, 44);
    const line2 = lines[i + 1].padEnd(44, "<").slice(0, 44);

    let parsed;
    try {
      parsed = parseMrz([line1, line2], { autocorrect: true });
    } catch {
      continue;
    }

    if (parsed.format === "TD3" && parsed.valid) {
      return formatResult(parsed);
    }
  }

  return null;
}

// ---- Resource limits ------------------------------------------------------
// Tesseract decodes the whole image into a raw bitmap, so a small, highly
// compressed file can still need hundreds of MB. The byte limit on the upload
// (8-10 MB) therefore is not enough: the pixel count is checked from the file
// header before decoding, only one recognition runs at a time (one worker),
// the waiting line is short, and a stuck job is abandoned. Callers that use
// OCR opportunistically (maybeRunPassportOcr) treat every refusal as "no OCR
// result" and the upload still succeeds.
export const OCR_MAX_PIXELS = 24_000_000;
const OCR_MAX_QUEUE = 3;
const OCR_JOB_TIMEOUT_MS = 60_000;

export class OcrRejectedError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Reads width x height from a JPEG, PNG or WEBP header without decoding it.
export function readImageDimensions(buffer) {
  if (!buffer || buffer.length < 24) return null;
  // PNG: signature + IHDR
  if (buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // WEBP: RIFF....WEBP + VP8 / VP8L / VP8X chunk
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X" && buffer.length >= 30) {
      return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    }
    if (kind === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (kind === "VP8 " && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  // JPEG: walk the segments to the first start-of-frame marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += 2 + length;
    }
  }
  return null;
}

export function assertOcrImageWithinLimits(buffer) {
  const size = readImageDimensions(buffer);
  if (!size) throw new OcrRejectedError("OCR_IMAGE_UNREADABLE", "تعذر قراءة أبعاد الصورة", 422);
  if (size.width < 1 || size.height < 1 || size.width * size.height > OCR_MAX_PIXELS) {
    throw new OcrRejectedError("OCR_IMAGE_TOO_LARGE", "أبعاد الصورة كبيرة جدًا، صوّر الجواز بدقة أقل", 413);
  }
}

let ocrRunning = 0;
const ocrWaiting = [];

function acquireOcrSlot() {
  if (ocrRunning < 1) {
    ocrRunning += 1;
    return Promise.resolve();
  }
  if (ocrWaiting.length >= OCR_MAX_QUEUE) {
    throw new OcrRejectedError("OCR_BUSY", "خدمة قراءة الجواز مشغولة حاليًا، حاول بعد قليل", 503);
  }
  return new Promise((resolve) => ocrWaiting.push(resolve));
}

function releaseOcrSlot() {
  const next = ocrWaiting.shift();
  if (next) next();
  else ocrRunning -= 1;
}

export async function extractPassportData(imageBuffer) {
  assertOcrImageWithinLimits(imageBuffer);
  await acquireOcrSlot();
  try {
    const worker = await getWorker();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new OcrRejectedError("OCR_TIMEOUT", "استغرقت قراءة الجواز وقتًا طويلًا", 504)),
        OCR_JOB_TIMEOUT_MS
      );
    });
    try {
      const {
        data: { text },
      } = await Promise.race([worker.recognize(imageBuffer), timeout]);
      return parsePassportMrzText(text);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    releaseOcrSlot();
  }
}

const IMAGE_MIME_PREFIX = "image/";

// Platform 3.0 Phase 7 (Passport OCR Configuration) — the shared entry
// point both attachment upload paths (contact-request-documents.service.js
// and contact-requests.service.js's intake wizard) call. OCR only runs
// when the requirement explicitly opts in (ocrEnabled), keeping it
// configurable per visa/requirement rather than blindly scanning every
// upload. Runs entirely locally (this file's tesseract.js worker +
// vendored language data), so passport data is never sent externally.
// Never throws and never blocks the upload: a failed/absent extraction
// (bad photo, non-passport document, OCR error) just means no result is
// attached — the upload itself still succeeds.
export async function maybeRunPassportOcr(requirement, file) {
  if (!requirement?.ocrEnabled || !file.mimetype.startsWith(IMAGE_MIME_PREFIX)) {
    return null;
  }
  // Platform 3.0 Phase 13: the PASSPORT_OCR flag gates both this
  // automatic per-requirement extraction and the standalone staff scan
  // tool (passport-ocr.routes.js) — disabling it stops OCR everywhere,
  // not just one entry point.
  if (!(await isFeatureEnabled("PASSPORT_OCR"))) return null;

  try {
    const buffer = file.buffer || (await fs.readFile(file.path));
    return await extractPassportData(buffer);
  } catch {
    return null;
  }
}

export async function terminateOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = undefined;
}

function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Compares OCR-extracted MRZ data against a stored Customer record so staff
// scanning a passport for an existing order/customer can catch a
// mismatched document (wrong passport, mistyped number, a stale record)
// before it goes further. Deliberately conservative: a field is only ever
// reported "mismatch" when the comparison is actually reliable — see the
// nationality note below for why that field never gets a match/mismatch
// verdict.
export function comparePassportDataToCustomer(extracted, customer) {
  const results = [];

  const extractedPassportNo = String(extracted.documentNumber || "").toUpperCase().trim();
  const storedPassportNo = String(customer.passportNo || "").toUpperCase().trim();
  results.push({
    field: "passportNo",
    extracted: extracted.documentNumber,
    stored: customer.passportNo,
    status: !extractedPassportNo || !storedPassportNo ? "not_comparable" : extractedPassportNo === storedPassportNo ? "match" : "mismatch",
  });

  const ocrNameForward = normalizeName(`${extracted.givenNames || ""} ${extracted.surname || ""}`);
  const ocrNameReversed = normalizeName(`${extracted.surname || ""} ${extracted.givenNames || ""}`);
  const storedName = normalizeName(customer.fullName);
  results.push({
    field: "fullName",
    extracted: [extracted.givenNames, extracted.surname].filter(Boolean).join(" ") || null,
    stored: customer.fullName,
    status: !storedName || (!ocrNameForward && !ocrNameReversed) ? "not_comparable" : storedName === ocrNameForward || storedName === ocrNameReversed ? "match" : "mismatch",
  });

  const extractedDob = isoDate(extracted.dateOfBirth);
  const storedDob = isoDate(customer.birthDate);
  results.push({
    field: "dateOfBirth",
    extracted: extracted.dateOfBirth,
    stored: storedDob,
    status: !extractedDob || !storedDob ? "not_comparable" : extractedDob === storedDob ? "match" : "mismatch",
  });

  // Never compared: the MRZ gives an ISO 3166-1 alpha-3 code (e.g. "SDN")
  // while Customer.nationality is free text that, depending on how the
  // record was created, might hold that same code, an English name, or an
  // Arabic name (see backend/public/assets/request.js's COUNTRY_NAME_AR mapping
  // used when this same OCR result fills the intake form). Comparing those
  // formats directly would produce false "mismatch" results far more often
  // than it would catch a real one, so this is reported for staff to read,
  // never scored.
  results.push({ field: "nationality", extracted: extracted.nationality, stored: customer.nationality, status: "not_comparable" });

  return { customerId: customer.id, fields: results, hasMismatch: results.some((r) => r.status === "mismatch") };
}
