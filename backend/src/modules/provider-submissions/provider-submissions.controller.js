import {
  completeProviderSubmissionSchema,
  createProviderSubmissionSchema,
} from "./provider-submissions.validators.js";
import {
  buildProviderPackage,
  completeProviderSubmission,
  createProviderSubmission,
  listProviderSubmissions,
} from "./provider-submissions.service.js";

const ERROR_RESPONSES = {
  NOT_FOUND: { status: 404, message: "Contact request not found" },
  PROVIDER_NOT_FOUND: { status: 404, message: "Provider not found or inactive" },
  PROVIDER_NOT_CONFIGURED: { status: 400, message: "This provider has no submission channel configured" },
  PROVIDER_RECIPIENT_INVALID: { status: 400, message: "This provider has no valid submission email configured" },
  DOCUMENT_NOT_FOUND: { status: 400, message: "One of the selected documents does not belong to this case" },
  RESTRICTED_DOCUMENT: {
    status: 400,
    message: "Internal/financial documents are excluded from provider packages unless explicitly allowed",
  },
  SUBMISSION_NOT_FOUND: { status: 404, message: "Submission not found on this case" },
  ALREADY_SUBMITTED: { status: 409, message: "This submission is already marked submitted" },
};

function respondToError(res, result) {
  const mapped = ERROR_RESPONSES[result.error];
  if (!mapped) return null;
  return res.status(mapped.status).json({ success: false, message: mapped.message, details: result.details });
}

export async function getProviderPackage(req, res, next) {
  try {
    const result = await buildProviderPackage(req.params.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;
    return res.status(200).json({ success: true, data: result.package });
  } catch (error) {
    next(error);
  }
}

export async function getProviderSubmissions(req, res, next) {
  try {
    const result = await listProviderSubmissions(req.params.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;
    return res.status(200).json({ success: true, data: result.submissions });
  } catch (error) {
    next(error);
  }
}

export async function storeProviderSubmission(req, res, next) {
  try {
    const parsed = createProviderSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await createProviderSubmission(req.params.id, parsed.data, req.user.id, req.user.organizationId);
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(201).json({ success: true, data: result.submission });
  } catch (error) {
    next(error);
  }
}

export async function patchProviderSubmission(req, res, next) {
  try {
    const parsed = completeProviderSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await completeProviderSubmission(
      req.params.id,
      req.params.submissionId,
      parsed.data,
      req.user.id,
      req.user.organizationId
    );
    const errorResponse = respondToError(res, result);
    if (errorResponse) return errorResponse;

    return res.status(200).json({ success: true, data: result.submission });
  } catch (error) {
    next(error);
  }
}
