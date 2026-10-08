import { createCaseNoteSchema } from "./case-notes.validators.js";
import { createCaseNote, listCaseNotes } from "./case-notes.service.js";

const ERROR_RESPONSES = {
  NOT_FOUND: { status: 404, message: "Contact request not found" },
};

function respondToError(res, result) {
  const mapped = ERROR_RESPONSES[result.error];
  if (!mapped) return null;
  return res.status(mapped.status).json({ success: false, message: mapped.message });
}

export async function getCaseNotes(req, res, next) {
  try {
    const result = await listCaseNotes(req.params.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;
    return res.status(200).json({ success: true, data: result.notes });
  } catch (error) {
    next(error);
  }
}

export async function storeCaseNote(req, res, next) {
  try {
    const parsed = createCaseNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await createCaseNote(req.params.id, parsed.data, req.user.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(201).json({ success: true, data: result.note });
  } catch (error) {
    next(error);
  }
}
