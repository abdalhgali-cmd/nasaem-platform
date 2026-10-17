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
import { validateEgyptClearanceDraft } from "./egypt-clearance-draft.js";
import { issuePaymentAccess } from "../contact-request-payment-access/payment-access.service.js";

// Smart Case Operations — Release B. Every draft error maps to a clean
// status here rather than leaking through as a 500, mirroring how the
// tracking/contact-request controllers already short-circuit their own
// service error codes.
const DRAFT_ERROR_RESPONSES = {
  NOT_FOUND: { status: 404, message: "الطلب غير موجود" },
  EXPIRED: { status: 410, message: "انتهت صلاحية هذا الطلب، يرجى بدء طلب جديد" },
  ALREADY_SUBMITTED: { status: 409, message: "تم إرسال هذا الطلب بالفعل" },
  INCOMPLETE_DRAFT: { status: 400, message: "الاسم ورقم الهاتف مطلوبان قبل إرسال الطلب" },
  EGYPT_CLEARANCE_INCOMPLETE: {
    status: 400,
    message: "يرجى إكمال بيانات الموافقة الأساسية ورفع صورة الجواز قبل إرسال الطلب",
  },
  EGYPT_VARIANT_UNAVAILABLE: { status: 409, message: "هذا النوع من الموافقة غير متاح للحجز حاليًا." },
  FIXED_TOTAL_REQUIRED: { status: 400, message: "أكّد الإجمالي النهائي قبل إرسال الطلب." },
  ENTRY_MODE_MISMATCH: { status: 400, message: "طريقة الدخول المرسلة لا تطابق نوع الموافقة المختار. اختر النوع الصحيح ثم أعد الإرسال." },
  ENTRY_MODE_INVALID: { status: 400, message: "طريقة الدخول غير صحيحة. اختر الطيران أو المعبر." },
  GUARANTOR_PHONE_INVALID: { status: 400, message: "رقم هاتف الضامن غير صحيح." },
  EXTRA_CONTACT_PHONE_INVALID: { status: 400, message: "رقم هاتف جهة الاتصال الإضافية غير صحيح." },
  ROUTE_INVALID: { status: 400, message: "بيانات خط السير طويلة جدًا. اختصرها ثم أعد الإرسال." },
  DOCUMENT_NOT_FOUND: { status: 404, message: "المستند غير موجود في هذا الطلب" },
  REQUIREMENT_NOT_FOUND: { status: 400, message: "هذا المتطلب لا ينتمي إلى الخدمة المحددة" },
  INVALID_MIME: { status: 400, message: "نوع هذا الملف غير مسموح به لهذا المتطلب" },
  FILE_TOO_LARGE: { status: 400, message: "حجم هذا الملف أكبر من الحد المسموح به لهذا المتطلب" },
  MAX_FILES_REACHED: { status: 400, message: "تم الوصول إلى الحد الأقصى لعدد الملفات المسموح بها لهذا المتطلب" },
};

function respondToDraftError(res, result) {
  if (result.error === "PRICE_CHANGED" || result.error === "PRICING_MODE_CHANGED") {
    return res.status(409).json({
      success: false,
      code: result.error,
      message:
        result.error === "PRICE_CHANGED"
          ? "تغيّر سعر الخدمة منذ أن راجعته. راجع الإجمالي الجديد ثم أكّد الطلب."
          : "أصبح سعر هذه الخدمة يُحدَّد بعرض سعر من الوكالة. حدّث الصفحة ثم أرسل الطلب.",
      details: result.details,
    });
  }
  const mapped = DRAFT_ERROR_RESPONSES[result.error];
  if (!mapped) return null;
  return res.status(mapped.status).json({ success: false, code: result.error, message: mapped.message, details: result.details });
}

export async function storeDraft(req, res, next) {
  try {
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const { draft, token } = await createDraft(parsed.data);
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

    // Ensure response shape matches frontend expectations:
    // Frontend checks for payload?.data?.id
    const responseDocument = result.document || {};
    return res.status(201).json({
      success: true,
      data: {
        ...responseDocument,
        // Ensure sizeBytes is also returned as fileSize for backwards compatibility
        fileSize: responseDocument.sizeBytes,
      }
    });
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

    // Egypt Security Approval has a dedicated approval-first customer journey.
    // Enforce its small set of mandatory approval facts on the server too;
    // UI-required attributes alone are not a security/business-rule boundary.
    const draft = await getDraftByToken(req.params.token);
    if (!draft) return res.status(404).json({ success: false, message: "Draft not found" });
    const egyptValidation = await validateEgyptClearanceDraft(draft);
    if (egyptValidation) {
      const errorResponse = respondToDraftError(res, egyptValidation);
      if (errorResponse) return errorResponse;
    }

    const result = await submitDraft(req.params.token, parsed.data);
    const errorResponse = respondToDraftError(res, result);
    if (errorResponse) return errorResponse;

    // Same as POST /contact-requests: an accepted fixed price goes straight
    // to its payment step (contact-request-payment-access).
    const paymentAccess = await issuePaymentAccess(result.contactRequest.id);
    return res.status(201).json({ success: true, data: { id: result.contactRequest.id, ...(paymentAccess ? { paymentAccess } : {}) } });
  } catch (error) {
    next(error);
  }
}
