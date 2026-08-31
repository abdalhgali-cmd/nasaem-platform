import { getCaseTimeline } from "./case-timeline.service.js";

export async function getTimeline(req, res, next) {
  try {
    const result = await getCaseTimeline(req.params.id, req.user.organizationId);
    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Contact request not found" });
    }
    return res.json({ success: true, data: result.entries });
  } catch (error) {
    next(error);
  }
}
