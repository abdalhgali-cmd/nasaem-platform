import { buildCaseWarnings, findReusableDocuments } from "./case-intelligence.service.js";

// Smart Case Operations — Release G.
export async function getCaseWarnings(req, res, next) {
  try {
    const result = await buildCaseWarnings(req.params.id, req.user.organizationId);
    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }
    return res.status(200).json({ success: true, data: result.warnings });
  } catch (error) {
    next(error);
  }
}

// Customer-facing: the caller's OWN previously-accepted documents, scoped
// to the phone their tracking session is authenticated as — never a
// customer id supplied by the client.
export async function getMyReusableDocuments(req, res, next) {
  try {
    const documents = await findReusableDocuments(req.trackingPhone, {
      requirementId: req.query.requirementId,
    });
    return res.status(200).json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
}
