import { z } from "zod";
import { sendRefusal } from "../contact-request-workflow/workflow-lock.js";
import { travelerIdsField } from "../contact-request-deliverables/contact-request-deliverables.validators.js";
import { attachEgyptTicket, discardUpload, editEgyptTravelDate, issueEgyptApproval, issueEgyptCircular, startEgyptCircular, verifyEgyptFlightDetails } from "./egypt-approval.service.js";
import { flightDetailsFields } from "./flight-details.js";
import { EGYPT_QUEUE_FILTERS, EGYPT_QUEUE_STAGES, getEgyptWorkspace, listEgyptQueue } from "./egypt-queue.service.js";
import { ALERT_DEFAULTS, alertSettings, saveAlertSettings } from "./alert-settings.service.js";
import { rescheduleTravelReminders } from "./travel-reminders.service.js";
import { CASE_PRIORITIES, setContactRequestPriority } from "../contact-requests/contact-requests.service.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD");

const queueSchema = z.object({
  stage: z.enum(EGYPT_QUEUE_STAGES).optional(),
  filter: z.enum(Object.keys(EGYPT_QUEUE_FILTERS)).optional(),
  entryMode: z.enum(["AIR", "BORDER"]).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  search: z.string().trim().max(80).optional(),
  view: z.enum(["queue", "schedule"]).optional(),
  assignee: z.union([z.enum(["mine", "unassigned"]), z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)]).optional(),
  includeClosed: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

const approvalSchema = z.object({
  issuedOn: dateOnly,
  travelerIds: travelerIdsField,
  label: z.string().trim().min(2).max(120).optional(),
});
const fileLabelSchema = z.object({ label: z.string().trim().min(2).max(120).optional(), travelerIds: travelerIdsField });
const circularSchema = z.object({ label: z.string().trim().min(2).max(120).optional(), issuedOn: dateOnly.optional(), travelerIds: travelerIdsField });
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
    return res.json({ success: true, data: await listEgyptQueue(req.user.organizationId, { ...parsed.data, userId: req.user.id }) });
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
    const parsed = circularSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed, req.file);
    return answer(res, await issueEgyptCircular(req.params.id, req.user.organizationId, req.user.id, { label: parsed.data.label, issuedOn: parsed.data.issuedOn, file: req.file }), 201);
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

export async function getEgyptAlertSettings(req, res, next) {
  try {
    return res.json({ success: true, data: { settings: await alertSettings(), defaults: ALERT_DEFAULTS } });
  } catch (error) {
    next(error);
  }
}

// Administrators only (route). A changed travel-reminder lead time re-plans
// the open requests' reminders at once.
export async function putEgyptAlertSettings(req, res, next) {
  try {
    const result = await saveAlertSettings(req.body, { userId: req.user.id });
    if (result.error) {
      return res.status(400).json({ success: false, code: result.error, message: "قيم التنبيهات غير صالحة.", errors: result.details });
    }
    const rescheduled = result.travelScheduleChanged ? await rescheduleTravelReminders() : { rescheduled: 0 };
    return res.json({ success: true, data: { settings: result.settings, ...rescheduled } });
  } catch (error) {
    next(error);
  }
}

const prioritySchema = z.object({
  priority: z.enum(CASE_PRIORITIES).optional(),
  dueAt: z.union([z.string().datetime({ offset: true }), dateOnly, z.null()]).optional()
    .transform((value) => (value === undefined ? undefined : value === null ? null : new Date(value.length === 10 ? `${value}T23:59:59.000+02:00` : value))),
}).strict().refine((body) => body.priority !== undefined || body.dueAt !== undefined, "أرسل الأولوية أو تاريخ الاستحقاق");

export async function patchCasePriority(req, res, next) {
  try {
    const parsed = prioritySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    const result = await setContactRequestPriority(req.params.id, parsed.data, req.user.id, req.user.organizationId);
    return answer(res, result);
  } catch (error) {
    next(error);
  }
}

const flightDetailsSchema = z.object({
  ...flightDetailsFields,
  verified: z.boolean(),
  reason: z.string().trim().max(300).optional(),
}).strict();

export async function patchEgyptFlightDetails(req, res, next) {
  try {
    const parsed = flightDetailsSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed);
    return answer(res, await verifyEgyptFlightDetails(req.params.id, req.user.organizationId, req.user.id, parsed.data));
  } catch (error) {
    next(error);
  }
}
