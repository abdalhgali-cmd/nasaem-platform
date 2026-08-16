import {
  requestCodeSchema,
  verifyCodeSchema,
} from "./contact-request-tracking.validators.js";
import {
  requestLoginCode,
  verifyLoginCode,
  listContactRequestsForPhone,
  approveInvoice,
  rejectInvoice,
  markTransferSent,
  uploadMyDocument,
  getMyDocumentFile,
} from "./contact-request-tracking.service.js";
import { uploadContactRequestDocumentSchema } from "../contact-request-documents/contact-request-documents.validators.js";
import { getTrackingTokenMaxAgeMs } from "../../utils/jwt.js";

const TRACKING_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

export async function requestCode(req, res, next) {
  try {
    const parsed = requestCodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const { debugCode } = await requestLoginCode(parsed.data.phone);

    return res.status(200).json({
      success: true,
      message: "إذا كان الرقم مسجلاً، سيصلك رمز التحقق عبر واتساب",
      ...(debugCode ? { debugCode } : {}),
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyCode(req, res, next) {
  try {
    const parsed = verifyCodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await verifyLoginCode(parsed.data.phone, parsed.data.code);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.cookie("trackingAccessToken", result.token, {
      ...TRACKING_COOKIE_OPTIONS,
      maxAge: getTrackingTokenMaxAgeMs(),
    });

    return res.status(200).json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyRequests(req, res, next) {
  try {
    const requests = await listContactRequestsForPhone(req.trackingPhone);

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
}

function respondToAction(res, result, successMessage) {
  if (result.error === "NOT_FOUND") {
    return res.status(404).json({
      success: false,
      message: "Contact request or invoice not found",
    });
  }

  if (result.error === "INVALID_STATE") {
    return res.status(409).json({
      success: false,
      message: "This action isn't available for the request's current state",
    });
  }

  return res.status(200).json({
    success: true,
    message: successMessage,
  });
}

export async function approveMyInvoice(req, res, next) {
  try {
    const result = await approveInvoice(req.trackingPhone, req.params.id);
    return respondToAction(res, result, "تمت الموافقة على السعر");
  } catch (error) {
    next(error);
  }
}

export async function rejectMyInvoice(req, res, next) {
  try {
    const result = await rejectInvoice(req.trackingPhone, req.params.id);
    return respondToAction(res, result, "تم رفض عرض السعر");
  } catch (error) {
    next(error);
  }
}

export async function markMyTransferSent(req, res, next) {
  try {
    const result = await markTransferSent(req.trackingPhone, req.params.id);
    return respondToAction(res, result, "تم إعلام فريقنا بالتحويل، سنراجعه قريبًا");
  } catch (error) {
    next(error);
  }
}

export async function uploadDocument(req, res, next) {
  try {
    const parsed = uploadContactRequestDocumentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "A file is required",
      });
    }

    const result = await uploadMyDocument(req.trackingPhone, req.params.id, {
      label: parsed.data.label,
      file: req.file,
    });

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Contact request not found",
      });
    }

    return res.status(201).json({
      success: true,
      data: result.document,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadMyDocumentFile(req, res, next) {
  try {
    const file = await getMyDocumentFile(req.trackingPhone, req.params.id, req.params.documentId);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.sendFile(file.absolutePath, {
      headers: { "Content-Type": file.mimeType },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    res.clearCookie("trackingAccessToken", TRACKING_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "تم تسجيل الخروج",
    });
  } catch (error) {
    next(error);
  }
}
