import path from "path";
import {
  approveContactRequestPaymentSchema,
  createContactRequestOfferSchema,
  createContactRequestSchema,
  updateContactRequestOfferSchema,
  updateContactRequestStatusSchema,
  updateDocumentStatusSchema,
  updateExecutionStageSchema,
  updatePaymentStatusSchema,
} from "./contact-requests.validators.js";
import {
  approveContactRequestOffer,
  approveInvoice,
  assertContactRequestAccess,
  attachAdditionalDocuments,
  attachGuarantorIdImages,
  attachPassportImages,
  attachPaymentReceipt,
  createContactRequest,
  createContactRequestOffer,
  createOrUpdatePriceQuote,
  listContactRequestDocuments,
  listContactRequestOffers,
  listContactRequests,
  listContactRequestsForPhone,
  updateContactRequestDocumentStatus,
  updateContactRequestExecutionStage,
  updateContactRequestOffer,
  updateContactRequestStatus,
  updatePaymentStatus,
  withdrawContactRequestOffer,
} from "./contact-requests.service.js";
import { deriveCustomerFacingStatus } from "./contact-request-status.js";
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
      department: req.query.department,
      user: req.user,
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

// Customer-facing: the internal status/paymentStatus enums are staff triage
// vocabulary, so each row is mapped through deriveCustomerFacingStatus
// instead of returning them verbatim.
export async function getMyContactRequests(req, res, next) {
  try {
    const rows = await listContactRequestsForPhone(req.customerPhone);

    const data = rows.map((row) => {
      const hasPendingInvoice = row.invoice?.status === "PENDING_APPROVAL";
      const pendingOffers = (row.offers || []).filter((o) => o.status === "PENDING_APPROVAL");

      return {
        id: row.id,
        referenceNumber: row.referenceNumber,
        service: row.service,
        createdAt: row.createdAt,
        currency: row.currency,
        paymentAmount: row.paymentAmount,
        executionStage: row.executionStage,
        friendlyStatus: deriveCustomerFacingStatus({
          ...row,
          hasPendingInvoice,
          hasPendingOffers: pendingOffers.length > 0,
          executionStage: row.executionStage,
        }),
        pendingInvoice: hasPendingInvoice
          ? {
              invoiceNumber: row.invoice.invoiceNumber,
              currency: row.invoice.currency,
              amount: row.invoice.amount,
            }
          : null,
        pendingOffers: pendingOffers.map((o) => ({
          id: o.id,
          currency: o.currency,
          amount: o.amount,
          notes: o.notes,
          legs: o.legs.map((l) => ({
            id: l.id,
            direction: l.direction,
            tripNumber: l.tripNumber,
            departureAt: l.departureAt,
            arrivalAt: l.arrivalAt,
            fromLocation: l.fromLocation,
            toLocation: l.toLocation,
            carrier: { name: l.carrier.name, mode: l.carrier.mode },
          })),
        })),
        documents: row.documents.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          rejectionReason: d.rejectionReason,
          createdAt: d.createdAt,
        })),
      };
    });

    return res.status(200).json({ success: true, data });
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

    const contactRequest = await updateContactRequestStatus(id, parsed.data.status, req);

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

// Shared by the passport-photo and guarantor-Iqama-photo batch uploads,
// which are otherwise identical (both attach one file per traveler, in
// the same order as the "person" blocks on the form).
async function uploadTravelerImages(req, res, next, attach, notFoundLabel) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No images uploaded" });
    }

    const contactRequest = await attach(req.params.id, req.files);

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(200).json({ success: true, message: `${notFoundLabel} images uploaded` });
  } catch (error) {
    next(error);
  }
}

export function uploadContactRequestPassportImages(req, res, next) {
  return uploadTravelerImages(req, res, next, attachPassportImages, "Passport");
}

export function uploadContactRequestGuarantorIdImages(req, res, next) {
  return uploadTravelerImages(req, res, next, attachGuarantorIdImages, "Guarantor ID");
}

export function uploadContactRequestAdditionalDocuments(req, res, next) {
  return uploadTravelerImages(req, res, next, attachAdditionalDocuments, "Additional document");
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

    const contactRequest = await updatePaymentStatus(id, parsed.data.status, req);

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(200).json({ success: true, data: contactRequest });
  } catch (error) {
    next(error);
  }
}

export async function patchContactRequestExecutionStage(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateExecutionStageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const contactRequest = await updateContactRequestExecutionStage(id, parsed.data, req);

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(200).json({ success: true, data: contactRequest });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

// Staff proposes (or revises) a price — does not itself start the payment
// flow, see createOrUpdatePriceQuote. The customer approving it via
// postApproveInvoice below is what actually does that.
export async function patchContactRequestPayment(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = approveContactRequestPaymentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await createOrUpdatePriceQuote(id, parsed.data, req);

    if (result === null) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(200).json({ success: true, data: result.contactRequest, invoice: result.invoice });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

// Customer-facing: the actual agreement to pay. requireCustomerAuth already
// verified who's calling (req.customerPhone); approveInvoice separately
// checks that phone actually owns this specific request before letting the
// approval through.
export async function postApproveInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const result = await approveInvoice(id, req.customerPhone, req);

    if (result === null) {
      return res.status(404).json({ success: false, message: "Request or quote not found" });
    }

    if (result === "forbidden") {
      return res.status(403).json({ success: false, message: "This request does not belong to you" });
    }

    if (result === undefined) {
      return res.status(400).json({ success: false, message: "This quote is no longer awaiting approval" });
    }

    return res.status(200).json({ success: true, data: result.contactRequest, bankAccount: result.bankAccount });
  } catch (error) {
    next(error);
  }
}

// Staff-only file downloads for customer-uploaded images — kept behind
// auth (unlike site-assets' file route) since passport/Iqama photos and
// bank receipts are sensitive, not public branding assets. Uses
// res.download() (Content-Disposition: attachment) rather than
// res.sendFile() so opening the link actually saves the file to disk
// instead of just displaying it in the browser tab.
function downloadFile(req, res, next, storagePath, downloadName) {
  if (!storagePath) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  return res.download(path.join(UPLOAD_ROOT, storagePath), `${downloadName}${path.extname(storagePath)}`, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ success: false, message: "File missing on disk" });
    }
  });
}

export async function getContactRequestDocuments(req, res, next) {
  try {
    const documents = await listContactRequestDocuments(req.params.id, req);
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
}

const DOCUMENT_DOWNLOAD_LABELS = {
  PASSPORT: "passport",
  GUARANTOR_ID: "guarantor-id",
  ADDITIONAL: "document",
};

export async function downloadContactRequestDocument(req, res, next) {
  try {
    const document = await prisma.contactRequestDocument.findUnique({ where: { id: req.params.documentId } });

    if (!document || document.contactRequestId !== req.params.id) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const contactRequest = await prisma.contactRequest.findUnique({
      where: { id: req.params.id },
      select: { department: true },
    });
    assertContactRequestAccess(req.user, contactRequest);

    return downloadFile(req, res, next, document.storagePath, DOCUMENT_DOWNLOAD_LABELS[document.type]);
  } catch (error) {
    next(error);
  }
}

export async function patchContactRequestDocumentStatus(req, res, next) {
  try {
    const parsed = updateDocumentStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const document = await updateContactRequestDocumentStatus(req.params.id, req.params.documentId, parsed.data, req);

    if (!document) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    return res.status(200).json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
}

export async function getContactRequestPaymentReceipt(req, res, next) {
  try {
    const contactRequest = await prisma.contactRequest.findUnique({ where: { id: req.params.id } });
    if (contactRequest) assertContactRequestAccess(req.user, contactRequest);
    return downloadFile(req, res, next, contactRequest?.paymentReceiptPath, "payment-receipt");
  } catch (error) {
    next(error);
  }
}

// Staff proposes one of possibly several priced alternatives (e.g. two
// airlines at two prices) for a request — the counterpart to
// patchContactRequestPayment, but many-per-request instead of 1:1.
export async function postCreateContactRequestOffer(req, res, next) {
  try {
    const parsed = createContactRequestOfferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const offer = await createContactRequestOffer(req.params.id, parsed.data, req);

    if (!offer) {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    return res.status(201).json({ success: true, data: offer });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

export async function getContactRequestOffers(req, res, next) {
  try {
    const offers = await listContactRequestOffers(req.params.id, req);
    return res.status(200).json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
}

export async function patchContactRequestOffer(req, res, next) {
  try {
    const parsed = updateContactRequestOfferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const offer = await updateContactRequestOffer(req.params.id, req.params.offerId, parsed.data, req);

    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found" });
    }

    return res.status(200).json({ success: true, data: offer });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

export async function postWithdrawContactRequestOffer(req, res, next) {
  try {
    const offer = await withdrawContactRequestOffer(req.params.id, req.params.offerId, req);

    if (!offer) {
      return res.status(404).json({ success: false, message: "Offer not found" });
    }

    return res.status(200).json({ success: true, data: offer });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

// Customer-facing: picks exactly one of the pending offers on their own
// request. requireCustomerAuth already verified who's calling
// (req.customerPhone); approveContactRequestOffer separately checks that
// phone actually owns this specific request before letting it through.
export async function postApproveContactRequestOffer(req, res, next) {
  try {
    const result = await approveContactRequestOffer(req.params.id, req.params.offerId, req.customerPhone, req);

    if (result === null) {
      return res.status(404).json({ success: false, message: "Request or offer not found" });
    }

    if (result === "forbidden") {
      return res.status(403).json({ success: false, message: "This request does not belong to you" });
    }

    if (result === undefined) {
      return res.status(400).json({ success: false, message: "This offer is no longer awaiting approval" });
    }

    return res
      .status(200)
      .json({ success: true, data: result.contactRequest, offer: result.offer, bankAccount: result.bankAccount });
  } catch (error) {
    next(error);
  }
}
