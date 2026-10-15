import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocumentSlots, buildUploadParts, validateSlots, validateFile, validateTravelers, validateContact,
  collectAnswers, missingAnswers, requirementApplies, serializeDraft, parseDraft, draftKey, MAX_DOCUMENTS,
} from "../www/js/intake-core.js";

const passport = { id: "r-pass", name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true };
const invite = { id: "r-inv", name: "مستند الدعوة", type: "DOCUMENT", scope: "CASE", required: true };
const photo = { id: "r-photo", name: "الصورة الشخصية", type: "DOCUMENT", scope: "TRAVELER", required: false };
const travelers = [{ fullName: "أحمد" }, { fullName: "سارة" }, { fullName: "" }];
const file = (name, type = "image/jpeg", size = 1000) => ({ name, type, size });

test("a traveler-scoped document gets one slot per traveler, a case-scoped one gets a single slot", () => {
  const slots = buildDocumentSlots([passport, invite], {}, travelers);
  assert.deepEqual(slots.map((s) => s.key), ["r-pass::0", "r-pass::1", "r-pass::2", "r-inv"]);
  assert.match(slots[1].label, /سارة/);
  assert.equal(slots[3].travelerIndex, null);
});

test("files are sent against the slot they were picked for - never another traveler's", () => {
  const slots = buildDocumentSlots([passport, invite], {}, travelers);
  const files = new Map([["r-pass::1", file("sara.jpg")], ["r-pass::0", file("ahmad.jpg")], ["r-inv", file("invite.pdf", "application/pdf")]]);
  const parts = buildUploadParts(slots, files);
  assert.deepEqual(parts.files.map((f) => f.name), ["ahmad.jpg", "sara.jpg", "invite.pdf"]);
  assert.deepEqual(parts.travelerIndexes, ["0", "1", ""]);
  assert.deepEqual(parts.requirementIds, ["r-pass", "r-pass", "r-inv"]);
  assert.equal(parts.labels.length, parts.files.length);
});

test("a request is not complete while a required document is missing; optional ones may stay empty", () => {
  const slots = buildDocumentSlots([passport, photo], {}, travelers.slice(0, 2));
  const problems = validateSlots(slots, new Map([["r-pass::0", file("a.jpg")]]));
  assert.deepEqual(problems.map((p) => p.key), ["r-pass::1"]);
  assert.match(problems[0].message, /سارة/);
  assert.deepEqual(validateSlots(slots, new Map([["r-pass::0", file("a.jpg")], ["r-pass::1", file("b.jpg")]])), []);
});

test("file type and size are checked against the requirement and the global ceiling", () => {
  assert.match(validateFile(file("x.exe", "application/x-msdownload"), passport), /غير مدعوم/);
  assert.match(validateFile(file("big.jpg", "image/jpeg", 11 * 1024 * 1024), passport), /كبير/);
  assert.match(validateFile(file("a.pdf", "application/pdf"), { allowedMimeTypes: ["image/png"] }), /غير مدعوم/);
  assert.match(validateFile(file("b.jpg", "image/jpeg", 3 * 1024 * 1024), { maxSizeBytes: 1024 * 1024 }), /1 ميغابايت/);
  assert.equal(validateFile(file("ok.png", "image/png", 5000), passport), null);
});

test("never more files than the server accepts", () => {
  const many = { id: "m", name: "م", type: "DOCUMENT", scope: "TRAVELER", required: false };
  const tr = Array.from({ length: 6 }, (_, i) => ({ fullName: `م${i}` }));
  const slots = [...buildDocumentSlots([many, { ...many, id: "m2" }, { ...many, id: "m3" }], {}, tr)];
  const files = new Map(slots.map((s) => [s.key, file("f.jpg")]));
  assert.ok(slots.length > MAX_DOCUMENTS);
  assert.ok(validateSlots(slots, files).some((p) => p.key === null));
});

test("contact and traveler validation messages are in Arabic and name the traveler", () => {
  assert.deepEqual(Object.keys(validateContact({ name: "ع", phone: "12" })), ["name", "phone"]);
  assert.deepEqual(validateContact({ name: "علي أحمد", phone: "0911034372", email: "a@b.co" }), {});
  assert.ok(validateContact({ name: "علي أحمد", phone: "0911034372", email: "bad" }).email);
  assert.match(validateTravelers([{ fullName: "أ" }, { fullName: " " }])[1], /المسافر 2/);
});

test("conditional requirements and typed answers", () => {
  const cond = { id: "c", type: "TEXT", required: true, conditionRequirementId: "q", conditionOperator: "EQUALS", conditionValue: "نعم" };
  assert.equal(requirementApplies(cond, { q: "لا" }), false);
  assert.equal(requirementApplies(cond, { q: "نعم" }), true);
  const reqs = [{ id: "n", type: "NUMBER" }, { id: "y", type: "YES_NO" }, { id: "t", type: "TEXT", required: true }, passport];
  assert.deepEqual(collectAnswers(reqs, { n: "5", y: "false", t: "" }), { n: 5, y: false });
  assert.deepEqual(missingAnswers(reqs, { n: 5 }).map((m) => m.key), ["t"]);
});

test("drafts keep typed values only, expire, and survive garbage", () => {
  const now = 1_000_000;
  const raw = serializeDraft({ name: "علي", travelers: [{ fullName: "علي" }] }, now);
  assert.deepEqual(parseDraft(raw, now + 1000).values.name, "علي");
  assert.equal(parseDraft(raw, now + 15 * 24 * 3600 * 1000), null);
  assert.equal(parseDraft("{not json"), null);
  assert.equal(parseDraft(null), null);
  assert.notEqual(draftKey({ id: "1", isVisaType: true }), draftKey({ id: "1", isVisaType: false }));
});
