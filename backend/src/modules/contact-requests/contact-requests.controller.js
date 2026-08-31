import {
  assignContactRequestSchema,
  createContactRequestSchema,
  createInvoiceSchema,
  createOfferSchema,
  updateContactRequestStatusSchema,
} from "./contact-requests.validators.js";
import {
  assignContactRequest,
  confirmContactRequestPayment,
  createContactRequest,
  createOffer,
  createOrUpdateInvoice,
  listContactRequests,
  updateContactRequestStatus,
} from "./contact-requests.service.js";
import {
  buildPricingDescription,
  pricingOfferSchema,
  pricingPreviewSchema,
  pricingQuoteSchema,
  previewContactRequestPrice,
} from "./contact-requests.pricing.js";
import { reviewContactRequestDocumentSchema } from "../contact-request-documents/contact-request-documents.validators.js";
import {
  getContactRequestDocumentFile,
  updateContactRequestDocumentStatus,
} from "../contact-request-documents/contact-request-documents.service.js";
import { uploadContactRequestDeliverableSchema } from "../contact-request-deliverables/contact-request-deliverables.validators.js";
import {
  createContactRequestDeliverable,
  getContactRequestDeliverableFile,
} from "../contact-request-deliverables/contact-request-deliverables.service.js";
import { parsePagination } from "../../utils/pagination.js";

// Platform 3.0 Phase 6: mirrors contact-request-tracking.controller.js's
// UPLOAD_ERROR_MESSAGES for the same error codes, raised here by
// createContactRequest instead when a Service Intake submission's
// documentRequirementIds fail their requirement's own rules.
const UPLOAD_REQUIREMENT_ERROR_MESSAGES = {
  REQUIREMENT_NOT_FOUND: "One of the selected requirements does not belong to the selected visa type",
  INVALID_MIME: "One of the uploaded files has a type that isn't allowed for its requirement",
  FILE_TOO_LARGE: "One of the uploaded files exceeds the maximum size allowed for its requirement",
  MAX_FILES_REACHED: "Too many files were uploaded for one of the requirements",
  FEATURE_DISABLED: "This service is currently unavailable",
  // Smart Case Operations — Release A.
  TRAVELER_NOT_FOUND: "One of the uploaded documents references a traveler that wasn't submitted",
};

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

    if (parsed.data.website) {
      return res.status(201).json({
        success: true,
        message: "Request received",
      });
    }

    const contactRequest = await createContactRequest(parsed.data, req, req.files);

    // Platform 3.0 Phase 6: a file tagged with documentRequirementIds that
    // fails that requirement's own MIME/size/max-files rules — the whole
    // submission is rejected (nothing was created), same posture as any
    // other validation failure on this route.
    if (contactRequest?.error) {
      const status = contactRequest.error === "FEATURE_DISABLED" ? 403 : 400;
      return res.status(status).json({
        success: false,
        message: UPLOAD_REQUIREMENT_ERROR_MESSAGES[contactRequest.error] || "Validation failed",
        details: contactRequest.details,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Request received",
      data: { id: contactRequest.id },
    });
  } catch (error) {
    next(error);
  }
}

export async function getContactRequests(req, res, next) {
  try {
    // Smart Case Operations — Release C groundwork. `assignedUserId=mine`
    // is the "My Applications" work-queue view — resolved to the acting
    // staff member's own id here rather than trusting a client-supplied id
    // to mean "me" (that's just the plain assignedUserId=<id> filter,
    // already scoped to this organization by listContactRequests' where
    // clause below).
    const assignedUserId =
      req.query.assignedUserId === "mine" ? req.user.id : req.query.assignedUserId;

    const { data, meta } = await listContactRequests({
      ...parsePagination(req.query),
      status: req.query.status,
      organizationId: req.user.organizationId,
      assignedUserId,
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

    const contactRequest = await updateContactRequestStatus(id, parsed.data, req.user.id, req.user.organizationId);

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

export async function patchContactRequestAssignment(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = assignContactRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await assignContactRequest(id, parsed.data.assignedUserId, req.user.id, req.user.organizationId);

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }
    if (result.error === "ASSIGNEE_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Assignee not found in this organization" });
    }

    return res.status(200).json({ success: true, data: result.contactRequest });
  } catch (error) {
    next(error);
  }
}

export async function previewPricing(req, res, next) {
  try {
    const parsed = pricingPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    return res.status(200).json({
      success: true,
      data: previewContactRequestPrice(parsed.data),
    });
  } catch (error) {
    next(error);
  }
}

export async function storeInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = createInvoiceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await createOrUpdateInvoice(id, parsed.data, req.user.id);

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Contact request not found",
      });
    }

    if (result.error === "ALREADY_APPROVED") {
      return res.status(409).json({
        success: false,
        message: "Customer has already approved this invoice",
      });
    }

    if (result.error === "OFFERS_EXIST") {
      return res.status(409).json({
        success: false,
        message: "This request already uses multi-carrier offers, not a single invoice",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.invoice,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeInvoiceFromPricing(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = pricingQuoteSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const pricing = previewContactRequestPrice(parsed.data);
    const result = await createOrUpdateInvoice(
      id,
      {
        amount: pricing.customerPrice,
        currency: parsed.data.currency,
        description: buildPricingDescription(parsed.data),
      },
      req.user.id
    );

    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });
    if (result.error === "ALREADY_APPROVED") return res.status(409).json({ success: false, message: "Customer has already approved this invoice" });
    if (result.error === "OFFERS_EXIST") return res.status(409).json({ success: false, message: "This request already uses multi-carrier offers, not a single invoice" });

    return res.status(201).json({ success: true, data: { pricing, invoice: result.invoice } });
  } catch (error) {
    next(error);
  }
}

export async function storeOffer(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = createOfferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await createOffer(id, parsed.data, req.user.id);

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Contact request not found",
      });
    }

    if (result.error === "INVOICE_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "This request already has a single invoice, not multi-carrier offers",
      });
    }

    if (result.error === "ALREADY_SELECTED") {
      return res.status(409).json({
        success: false,
        message: "The customer has already selected an offer",
      });
    }

    return res.status(201).json({
      success: true,
      data: result.offer,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeOfferFromPricing(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = pricingOfferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const pricing = previewContactRequestPrice(parsed.data);
    const result = await createOffer(
      id,
      {
        carrier: parsed.data.carrier,
        amount: pricing.customerPrice,
        currency: parsed.data.currency,
        description: buildPricingDescription(parsed.data),
      },
      req.user.id
    );

    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });
    if (result.error === "INVOICE_EXISTS") return res.status(409).json({ success: false, message: "This request already has a single invoice, not multi-carrier offers" });
    if (result.error === "ALREADY_SELECTED") return res.status(409).json({ success: false, message: "The customer has already selected an offer" });

    return res.status(201).json({ success: true, data: { pricing, offer: result.offer } });
  } catch (error) {
    next(error);
  }
}

export async function confirmPayment(req, res, next) {
  try {
    const { id } = req.params;
    const result = await confirmContactRequestPayment(id, req.user.id);

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }

    if (result.error === "INVALID_STATE") {
      return res.status(409).json({ success: false, message: "Payment is not awaiting review" });
    }

    return res.status(200).json({ success: true, data: result.contactRequest });
  } catch (error) {
    next(error);
  }
}

export async function downloadDocumentFile(req, res, next) {
  try {
    const { id, documentId } = req.params;
    const file = await getContactRequestDocumentFile(id, documentId);

    if (!file) return res.status(404).json({ success: false, message: "Document not found" });

    return res.sendFile(file.absolutePath, { headers: { "Content-Type": file.mimeType } });
  } catch (error) {
    next(error);
  }
}

export async function reviewDocument(req, res, next) {
  try {
    const { id, documentId } = req.params;
    const parsed = reviewContactRequestDocumentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await updateContactRequestDocumentStatus(id, documentId, parsed.data, req.user.id);
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Document not found" });

    return res.status(200).json({ success: true, data: result.document });
  } catch (error) {
    next(error);
  }
}

export async function storeDeliverable(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = uploadContactRequestDeliverableSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    if (!req.file) return res.status(400).json({ success: false, message: "A file is required" });

    const result = await createContactRequestDeliverable(id, { label: parsed.data.label, file: req.file }, req.user.id);
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });

    return res.status(201).json({ success: true, data: result.deliverable });
  } catch (error) {
    next(error);
  }
}

export async function downloadDeliverableFile(req, res, next) {
  try {
    const { id, deliverableId } = req.params;
    const file = await getContactRequestDeliverableFile(id, deliverableId);

    if (!file) return res.status(404).json({ success: false, message: "Deliverable not found" });

    return res.sendFile(file.absolutePath, { headers: { "Content-Type": file.mimeType } });
  } catch (error) {
    next(error);
  }
}
