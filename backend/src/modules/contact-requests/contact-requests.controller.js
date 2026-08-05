import {
  createContactRequestSchema,
  updateContactRequestStatusSchema,
} from "./contact-requests.validators.js";
import {
  createContactRequest,
  listContactRequests,
  updateContactRequestStatus,
} from "./contact-requests.service.js";
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

    const contactRequest = await createContactRequest(parsed.data, req);

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
