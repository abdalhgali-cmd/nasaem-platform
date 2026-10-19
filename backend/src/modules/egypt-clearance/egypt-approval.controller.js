import { z } from "zod";
import { sendRefusal } from "../contact-request-workflow/workflow-lock.js";
import { travelerIdsField } from "../contact-request-deliverables/contact-request-deliverables.validators.js";
import { attachEgyptTicket, discardUpload, editEgyptTravelDate, issueEgyptApproval, issueEgyptCircular, startEgyptCircular } from "./egypt-approval.service.js";
import { EGYPT_QUEUE_STAGES, getEgyptWorkspace, listEgyptQueue } from "./egypt-queue.service.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD");

const queueSchema = z.object({
  stage: z.enum(EGYPT_QUEUE_STAGES).optional(),
  entryMode: z.enum(["AIR", "BORDER"]).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().trim().max(80).optional(),
  view: z.enum(["queue", "schedule"]).optional(),
  includeClosed: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

const approvalSchema = z.object({
  issuedOn: dateOnly,
  travelerIds: travelerIdsField,
  label: z.string().trim().min(2).max(120).optional(),
});
const fileLabelSchema = z.object({ label: z.string().trim().min(2).max(120).optional(), travelerIds: travelerIdsField });
const travelDateSchema = z.object({
  entryDate: dateOnly,
  reason: z.string().trim().min(3, "اكتب سبب تعديل التاريخ").max(300),
});

function invalid(res, parsed, file) {
  discardUpload(file);
  return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "Validation failed", errors: parsed.error.flatten() });
}

function answer(res, result, status = 200) {
  if (result.refusal) return sendRefusal(res, result.refusal);
  if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });
  if (result.error === "FILE_REQUIRED") return res.status(400).json({ success: false, code: "FILE_REQUIRED", message: "يرجى إرفاق الملف." });
  return res.status(status).json({ success: true, data: result.deliverable || result.contactRequest || result });
}

export async function getEgyptQueue(req, res, next) {
  try {
    const parsed = queueSchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed);
    return res.json({ success: true, data: await listEgyptQueue(req.user.organizationId, parsed.data) });
  } catch (error) {
    next(error);
  }
}

export async function getEgyptRequestWorkspace(req, res, next) {
  try {
    const data = await getEgyptWorkspace(req.params.id, req.user.organizationId);
    if (!data) return res.status(404).json({ success: false, message: "Contact request not found" });
    return res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function postEgyptApproval(req, res, next) {
  try {
    const parsed = approvalSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed, req.file);
    const result = await issueEgyptApproval(req.params.id, req.user.organizationId, req.user.id, { ...parsed.data, file: req.file });
    return answer(res, result, 201);
  } catch (error) {
    next(error);
  }
}

export async function postEgyptCircularProcessing(req, res, next) {
  try {
    return answer(res, await startEgyptCircular(req.params.id, req.user.organizationId, req.user.id));
  } catch (error) {
    next(error);
  }
}

export async function postEgyptCircular(req, res, next) {
  try {
    const parsed = fileLabelSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed, req.file);
    return answer(res, await issueEgyptCircular(req.params.id, req.user.organizationId, req.user.id, { label: parsed.data.label, file: req.file }), 201);
  } catch (error) {
    next(error);
  }
}

export async function postEgyptTicket(req, res, next) {
  try {
    const parsed = fileLabelSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed, req.file);
    return answer(res, await attachEgyptTicket(req.params.id, req.user.organizationId, req.user.id, { ...parsed.data, file: req.file }), 201);
  } catch (error) {
    next(error);
  }
}

export async function patchEgyptTravelDate(req, res, next) {
  try {
    const parsed = travelDateSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    return answer(res, await editEgyptTravelDate(req.params.id, req.user.organizationId, req.user.id, parsed.data));
  } catch (error) {
    next(error);
  }
}
