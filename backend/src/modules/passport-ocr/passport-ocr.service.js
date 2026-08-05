import path from "path";
import { createWorker } from "tesseract.js";
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

export async function terminateOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = undefined;
}
