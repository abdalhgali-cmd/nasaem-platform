// Rules of the request form, kept free of the DOM so they can be tested
// (tests/intake-core.test.mjs): which upload slots a request needs, whose
// document each one is, what blocks sending, and how the files map onto the
// multipart request the backend expects.
//
// A requirement the agency marks per-traveler (scope TRAVELER, e.g. the
// passport photo) gets ONE slot PER TRAVELER; every other document requirement
// is a single slot for the whole request. A file is only ever sent against the
// slot it was picked for, so one traveler's passport can never end up on
// another traveler.

// Matches the server (upload.middleware.js: .array("documents", 16)).
export const MAX_DOCUMENTS = 16;
export const MAX_TRAVELERS = 6;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function requirementApplies(requirement, answers = {}) {
  if (!requirement.conditionRequirementId || !requirement.conditionOperator) return true;
  const actual = answers[requirement.conditionRequirementId];
  const expected = requirement.conditionValue;
  if (requirement.conditionOperator === "EQUALS") return String(actual ?? "") === String(expected ?? "");
  if (requirement.conditionOperator === "NOT_EQUALS") return String(actual ?? "") !== String(expected ?? "");
  const actualNum = Number(actual);
  const expectedNum = Number(expected);
  if (!Number.isFinite(actualNum) || !Number.isFinite(expectedNum)) return false;
  if (requirement.conditionOperator === "GREATER_THAN") return actualNum > expectedNum;
  if (requirement.conditionOperator === "LESS_THAN") return actualNum < expectedNum;
  return true;
}

export function travelerLabel(travelers, index) {
  const name = String(travelers?.[index]?.fullName || "").trim();
  return name ? `المسافر ${index + 1} (${name})` : `المسافر ${index + 1}`;
}

// One slot per (document requirement x traveler) for traveler-scoped ones.
export function buildDocumentSlots(requirements = [], answers = {}, travelers = []) {
  const slots = [];
  for (const requirement of requirements) {
    if (requirement.type !== "DOCUMENT" || !requirementApplies(requirement, answers)) continue;
    if (requirement.scope === "TRAVELER" && travelers.length > 0) {
      travelers.forEach((_, index) => {
        slots.push({
          key: `${requirement.id}::${index}`,
          requirement,
          travelerIndex: index,
          label: `${requirement.name} — ${travelerLabel(travelers, index)}`,
        });
      });
    } else {
      slots.push({ key: requirement.id, requirement, travelerIndex: null, label: requirement.name });
    }
  }
  return slots;
}

// Removing traveler `index`: their files go, and every later traveler's files
// move down one place with them, so a passport always stays on its owner.
// Request-wide files (no "::index") are untouched. Returns a new Map.
export function removeTravelerFiles(files, index) {
  const next = new Map();
  for (const [key, file] of files) {
    const [requirementId, position] = String(key).split("::");
    if (position === undefined) { next.set(key, file); continue; }
    const at = Number(position);
    if (at === index) continue;
    next.set(at > index ? `${requirementId}::${at - 1}` : key, file);
  }
  return next;
}

export function validateFile(file, requirement) {
  if (!file) return null;
  const allowed = requirement?.allowedMimeTypes?.length ? requirement.allowedMimeTypes : DEFAULT_MIME;
  if (file.type && !allowed.includes(file.type)) return "نوع الملف غير مدعوم. ارفع صورة (JPG أو PNG) أو ملف PDF.";
  const limit = Math.min(requirement?.maxSizeBytes || MAX_FILE_BYTES, MAX_FILE_BYTES);
  if (file.size > limit) return `حجم الملف كبير جدًا. الحد الأقصى ${Math.floor(limit / (1024 * 1024))} ميغابايت.`;
  return null;
}

export function validateContact({ name, phone, email } = {}) {
  const errors = {};
  if (String(name || "").trim().length < 2) errors.name = "اكتب اسمك الكامل";
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 8) errors.phone = "اكتب رقم هاتف صحيحًا";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) errors.email = "البريد الإلكتروني غير صالح";
  return errors;
}

export function validateTravelers(travelers = []) {
  const errors = {};
  travelers.forEach((traveler, index) => {
    if (!String(traveler.fullName || "").trim()) errors[index] = `اكتب اسم ${travelerLabel(travelers, index)} كما في جواز السفر`;
  });
  return errors;
}

// Missing required documents and unusable files, per slot. `files` maps slot
// key -> File. Nothing is "complete" while a required slot is empty.
export function validateSlots(slots, files) {
  const problems = [];
  for (const slot of slots) {
    const file = files.get(slot.key);
    if (!file) {
      if (slot.requirement.required) problems.push({ key: slot.key, message: `ارفع: ${slot.label}` });
      continue;
    }
    const error = validateFile(file, slot.requirement);
    if (error) problems.push({ key: slot.key, message: `${slot.label}: ${error}` });
  }
  const count = slots.filter((slot) => files.get(slot.key)).length;
  if (count > MAX_DOCUMENTS) problems.push({ key: null, message: `يمكن إرفاق ${MAX_DOCUMENTS} ملفًا كحد أقصى مع الطلب (اخترت ${count}).` });
  return problems;
}

// The three parallel arrays + the file list the backend expects, in one order.
export function buildUploadParts(slots, files) {
  const parts = { files: [], labels: [], travelerIndexes: [], requirementIds: [], keys: [] };
  for (const slot of slots) {
    const file = files.get(slot.key);
    if (!file) continue;
    parts.files.push(file);
    parts.keys.push(slot.key);
    parts.labels.push(slot.label.slice(0, 120));
    parts.travelerIndexes.push(slot.travelerIndex === null ? "" : String(slot.travelerIndex));
    parts.requirementIds.push(slot.requirement.id);
  }
  return parts;
}

// Answers to the non-document requirements, typed the way the API stores them.
export function collectAnswers(requirements, rawValues) {
  const answers = {};
  for (const requirement of requirements) {
    if (requirement.type === "DOCUMENT") continue;
    const value = rawValues[requirement.id];
    if (value === undefined || value === null || value === "") continue;
    answers[requirement.id] = requirement.type === "NUMBER" ? Number(value) : requirement.type === "YES_NO" ? value === true || value === "true" : value;
  }
  return answers;
}

export function missingAnswers(requirements, answers) {
  return requirements
    .filter((requirement) => requirement.type !== "DOCUMENT" && requirement.required && requirementApplies(requirement, answers))
    .filter((requirement) => answers[requirement.id] === undefined)
    .map((requirement) => ({ key: requirement.id, message: `أكمل: ${requirement.name}` }));
}

// ---- Draft: what is typed is kept on the device so a dropped connection or a
// closed app does not lose it. Files are never stored. A request only counts as
// sent once the server confirmed it (submission.js); the draft is removed then.
const DRAFT_PREFIX = "nasaem.intake.draft.v1:";
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function draftKey(item) {
  return `${DRAFT_PREFIX}${item?.isVisaType ? "v" : "s"}:${item?.id || item?.code || "x"}`;
}

export function serializeDraft(values, now = Date.now()) {
  return JSON.stringify({ savedAt: now, values });
}

export function parseDraft(raw, now = Date.now()) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.savedAt !== "number") return null;
    if (now - parsed.savedAt > DRAFT_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
