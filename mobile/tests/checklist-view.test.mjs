import { test } from "node:test";
import assert from "node:assert/strict";
import { canUpload, actionCount, groupChecklist, uploadLabel, stateLabel } from "../www/js/checklist-view.js";

const checklist = [
  { requirementId: "p", label: "الجواز", kind: "DOCUMENT", required: true, state: "ACCEPTED", travelerId: "t1", travelerName: "أحمد" },
  { requirementId: "p", label: "الجواز", kind: "DOCUMENT", required: true, state: "REJECTED", reviewNote: "غير واضحة", travelerId: "t2", travelerName: "سارة" },
  { requirementId: "i", label: "الدعوة", kind: "DOCUMENT", required: true, state: "MISSING", travelerId: null },
  { requirementId: "o", label: "صورة اختيارية", kind: "DOCUMENT", required: false, state: "MISSING", travelerId: null },
  { requirementId: "q", label: "تاريخ السفر", kind: "ANSWER", required: true, state: "ANSWERED" },
];

test("each traveler's documents are grouped under that traveler; shared documents and answers follow", () => {
  assert.deepEqual(groupChecklist(checklist).map((g) => g.title), ["أحمد", "سارة", "مستندات الطلب", "معلومات الطلب"]);
});

test("only missing or rejected documents can be uploaded, and the upload names the traveler", () => {
  assert.deepEqual(checklist.map(canUpload), [false, true, true, true, false]);
  assert.equal(uploadLabel(checklist[1]), "الجواز — سارة");
  assert.equal(uploadLabel(checklist[2]), "الدعوة");
});

test("the action count is what blocks the customer: rejected and required-missing", () => {
  assert.equal(actionCount(checklist), 2);
  assert.equal(actionCount([]), 0);
  assert.equal(stateLabel("UNDER_REVIEW"), "قيد المراجعة");
});
