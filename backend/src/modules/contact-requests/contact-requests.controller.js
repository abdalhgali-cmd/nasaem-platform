import path from "path";
import {
  createContactRequestSchema,
  updateContactRequestStatusSchema,
  updatePaymentStatusSchema,
} from "./contact-requests.validators.js";
import {
  attachPassportImage,
  attachPaymentReceipt,
  createContactRequest,
  listContactRequests,
  updateContactRequestStatus,
  updatePaymentStatus,
} from "./contact-requests.service.js";
import { extractArabicNameSuggestion, extractPassportData } from "../passport-ocr/passport-ocr.service.js";
import { parsePagination } from "../../utils/pagination.js";
import prisma from "../../config/database.js";

const UPLOAD_ROOT = path.resolve("uploads");

export async function storeContactRequest(req, res, next) {
  try {
    const parsed = createContactRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    // Honeypot: a bot filled in a field real users never see. Respond as if
    // it succeeded (no error, no record created) so the bot has no signal
    // to learn from.
    if (parsed.data.website) {
      return res.status(201).json({
        success: true,
        message: "Request received",
      });
    }

    const { contactRequest, bankAccount } = await createContactRequest(parsed.data, req);

    return res.status(201).json({
      success: true,
      message: "Request received",
      data: {
        id: contactRequest.id,
        referenceNumber: contactRequest.referenceNumber,
        currency: contactRequest.currency,
        paymentAmount: contactRequest.paymentAmount,
        paymentStatus: contactRequest.paymentStatus,
        bankAccount,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getContactRequests(req, res, next) {
  try {
    const { data, meta } = await listContactRequests({
      ...parsePagination(req.query),
      status: req.query.status,
    });

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
}

export async function patchContactRequestStatus(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateContactRequestStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const contactRequest = await updateContactRequestStatus(id, parsed.data.status);

    if (!contactRequest) {
      return res.status(404).json({
        success: false,
        message: "Contact request not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: contactRequest,
    });
  } catch (error) {
    next(error);
  }
}

// Public — lets the Umrah request form prefill the passport number and
// suggest the Arabic name while the customer is still filling out the
// form, before any ContactRequest exists yet.
//
// documentNumber comes from the MRZ, which is checksum-validated (see
// parsePassportMrzText) — it's either exactly right or omitted entirely,
// and is what decides success/failure (422) for this endpoint.
//
// suggestedFullNameArabic comes from an unvalidated best-effort OCR pass
// over the printed page (the MRZ itself has no Arabic text on any
// passport, by the ICAO 9303 standard) with no check-digit equivalent to
// verify it against — Arabic OCR can hallucinate a plausible-looking
// result even from noise, so it's only ever attempted once the checksum
// on the MRZ has already confirmed this really is a legible passport
// photo, and it's always meant to prefill an editable field the customer
// reviews, never a value the frontend trusts outright.
export async function scanPassportForContactRequest(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    const mrzData = await extractPassportData(req.file.buffer);

    if (!mrzData) {
      return res.status(422).json({
        success: false,
        message:
          "Could not read a valid passport MRZ from this image. Try a clearer, well-lit, straight-on photo of the passport's data page.",
      });
    }

    const suggestedFullNameArabic = await extractArabicNameSuggestion(req.file.buffer).catch(() => null);

    return res.status(200).json({
      success: true,
      data: {
        documentNumber: mrzData.documentNumber,
        suggestedFullNameArabic,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadContactRequestPassportImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    const contactRequest = await attachPassportImage(req.params.id, req.file);

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(200).json({ success: true, message: "Passport image uploaded" });
  } catch (error) {
    next(error);
  }
}

export async function uploadContactRequestPaymentReceipt(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    const contactRequest = await attachPaymentReceipt(req.params.id, req.file);

    if (contactRequest === null) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    if (contactRequest === undefined) {
      return res.status(400).json({
        success: false,
        message: "This request has no pending payment to attach a receipt to",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment receipt uploaded, our team will review it shortly",
    });
  } catch (error) {
    next(error);
  }
}

export async function patchContactRequestPaymentStatus(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updatePaymentStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const contactRequest = await updatePaymentStatus(id, parsed.data.status);

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(200).json({ success: true, data: contactRequest });
  } catch (error) {
    next(error);
  }
}

// Staff-only file streaming for the two customer-uploaded images — kept
// behind auth (unlike site-assets' file route) since passport photos and
// bank receipts are sensitive, not public branding assets.
async function streamContactRequestFile(req, res, next, field) {
  try {
    const contactRequest = await prisma.contactRequest.findUnique({ where: { id: req.params.id } });
    const storagePath = contactRequest?.[field];

    if (!storagePath) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    return res.sendFile(path.join(UPLOAD_ROOT, storagePath), (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ success: false, message: "File missing on disk" });
      }
    });
  } catch (error) {
    next(error);
  }
}

export function getContactRequestPassportImage(req, res, next) {
  return streamContactRequestFile(req, res, next, "passportImagePath");
}

export function getContactRequestPaymentReceipt(req, res, next) {
  return streamContactRequestFile(req, res, next, "paymentReceiptPath");
}
