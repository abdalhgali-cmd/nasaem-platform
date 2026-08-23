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

export async function extractPassportData(imageBuffer) {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(imageBuffer);

  return parsePassportMrzText(text);
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
  // Arabic name (see frontend/assets/request.js's COUNTRY_NAME_AR mapping
  // used when this same OCR result fills the intake form). Comparing those
  // formats directly would produce false "mismatch" results far more often
  // than it would catch a real one, so this is reported for staff to read,
  // never scored.
  results.push({ field: "nationality", extracted: extracted.nationality, stored: customer.nationality, status: "not_comparable" });

  return { customerId: customer.id, fields: results, hasMismatch: results.some((r) => r.status === "mismatch") };
}
