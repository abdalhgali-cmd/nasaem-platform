import {
  addDraftDocumentSchema,
  createDraftSchema,
  submitDraftSchema,
  updateDraftSchema,
} from "./intake-drafts.validators.js";
import {
  addDraftDocument,
  createDraft,
  getDraftByToken,
  removeDraftDocument,
  submitDraft,
  updateDraft,
} from "./intake-drafts.service.js";

// Smart Case Operations — Release B. Every draft error maps to a clean
// status here rather than leaking through as a 500, mirroring how the
// tracking/contact-request controllers already short-circuit their own
// service error codes.
const DRAFT_ERROR_RESPONSES = {
  NOT_FOUND: { status: 404, message: "Draft not found" },
  EXPIRED: { status: 410, message: "This draft has expired, please start a new request" },
  ALREADY_SUBMITTED: { status: 409, message: "This draft was already submitted" },
  INCOMPLETE_DRAFT: { status: 400, message: "الاسم ورقم الهاتف مطلوبان قبل إرسال الطلب" },
  DOCUMENT_NOT_FOUND: { status: 404, message: "Document not found on this draft" },
  REQUIREMENT_NOT_FOUND: { status: 400, message: "This requirement does not belong to the selected service" },
  INVALID_MIME: { status: 400, message: "This file type isn't allowed for this requirement" },
  FILE_TOO_LARGE: { status: 400, message: "This file exceeds the maximum size allowed for this requirement" },
  MAX_FILES_REACHED: { status: 400, message: "The maximum number of files for this requirement has already been reached" },
};

function respondToDraftError(res, result) {
  const mapped = DRAFT_ERROR_RESPONSES[result.error];
  if (!mapped) return null;
  return res.status(mapped.status).json({ success: false, message: mapped.message, details: result.details });
}

export async function storeDraft(req, res, next) {
  try {
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const { draft, token } = await createDraft(parsed.data);
    // The token is returned exactly once, at creation — the client stores
    // it and sends it as the path parameter on every later call.
    return res.status(201).json({ success: true, data: { ...draft, token } });
  } catch (error) {
    next(error);
  }
}

export async function getDraft(req, res, next) {
  try {
    const draft = await getDraftByToken(req.params.token);
    if (!draft) return res.status(404).json({ success: false, message: "Draft not found" });
    return res.status(200).json({ success: true, data: draft });
  } catch (error) {
    next(error);
  }
}

export async function patchDraft(req, res, next) {
  try {
    const parsed = updateDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await updateDraft(req.params.token, parsed.data);
    const errorResponse = respondToDraftError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(200).json({ success: true, data: result.draft });
  } catch (error) {
    next(error);
  }
}

export async function storeDraftDocument(req, res, next) {
  try {
    const parsed = addDraftDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }
    if (!req.file) return res.status(400).json({ success: false, message: "A file is required" });

    const result = await addDraftDocument(req.params.token, {
      label: parsed.data.label,
      file: req.file,
      requirementId: parsed.data.requirementId,
      travelerIndex: parsed.data.travelerIndex,
    });

    const errorResponse = respondToDraftError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(201).json({ success: true, data: result.document });
  } catch (error) {
    next(error);
  }
}

export async function destroyDraftDocument(req, res, next) {
  try {
    const result = await removeDraftDocument(req.params.token, req.params.documentId);
    const errorResponse = respondToDraftError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(200).json({ success: true, message: "Document removed" });
  } catch (error) {
    next(error);
  }
}

export async function submitDraftController(req, res, next) {
  try {
    const parsed = submitDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await submitDraft(req.params.token, { message: parsed.data.message });
    const errorResponse = respondToDraftError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(201).json({ success: true, data: { id: result.contactRequest.id } });
  } catch (error) {
    next(error);
  }
}
