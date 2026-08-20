import {
  createContactRequestSchema,
  createInvoiceSchema,
  createOfferSchema,
  updateContactRequestStatusSchema,
} from "./contact-requests.validators.js";
import {
  confirmContactRequestPayment,
  createContactRequest,
  createOffer,
  createOrUpdateInvoice,
  listContactRequests,
  updateContactRequestStatus,
} from "./contact-requests.service.js";
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

    const contactRequest = await createContactRequest(parsed.data, req, req.files);

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

    const contactRequest = await updateContactRequestStatus(id, parsed.data, req.user.id);

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

export async function confirmPayment(req, res, next) {
  try {
    const { id } = req.params;
    const result = await confirmContactRequestPayment(id, req.user.id);

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Contact request not found",
      });
    }

    if (result.error === "INVALID_STATE") {
      return res.status(409).json({
        success: false,
        message: "Payment is not awaiting review",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.contactRequest,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadDocumentFile(req, res, next) {
  try {
    const { id, documentId } = req.params;
    const file = await getContactRequestDocumentFile(id, documentId);

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

export async function reviewDocument(req, res, next) {
  try {
    const { id, documentId } = req.params;
    const parsed = reviewContactRequestDocumentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await updateContactRequestDocumentStatus(
      id,
      documentId,
      parsed.data,
      req.user.id
    );

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.document,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeDeliverable(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = uploadContactRequestDeliverableSchema.safeParse(req.body);

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

    const result = await createContactRequestDeliverable(
      id,
      { label: parsed.data.label, file: req.file },
      req.user.id
    );

    if (result.error === "NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Contact request not found",
      });
    }

    return res.status(201).json({
      success: true,
      data: result.deliverable,
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadDeliverableFile(req, res, next) {
  try {
    const { id, deliverableId } = req.params;
    const file = await getContactRequestDeliverableFile(id, deliverableId);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: "Deliverable not found",
      });
    }

    return res.sendFile(file.absolutePath, {
      headers: { "Content-Type": file.mimeType },
    });
  } catch (error) {
    next(error);
  }
}
