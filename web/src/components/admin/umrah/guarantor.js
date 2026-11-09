// Which uploaded documents are the guarantor's residence permit. The
// requirement's identity (attachmentType) decides, so renaming the label in
// the requirements screen never hides the document. Only a document whose
// requirement is not in the request's checklist snapshot (an older request)
// falls back to the label text. Plain JavaScript so the backend test suite
// (Node 22 in CI) can run it without a TypeScript step.
export const GUARANTOR_ATTACHMENT_TYPE = "guarantor_residence";
export const GUARANTOR_LABEL = "إقامة الضامن";

/**
 * @param {{ requirementId?: string | null, label: string }} doc
 * @param {Array<{ id: string, attachmentType?: string | null }> | null | undefined} snapshot
 * @returns {boolean}
 */
export function isGuarantorResidenceDocument(doc, snapshot) {
  const requirement = doc.requirementId ? (snapshot || []).find((item) => item.id === doc.requirementId) : undefined;
  if (requirement) return requirement.attachmentType === GUARANTOR_ATTACHMENT_TYPE;
  return doc.label.includes(GUARANTOR_LABEL);
}
