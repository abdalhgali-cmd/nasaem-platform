// Customer and staff endpoints around the paid receipt and the Egypt flight
// choice. Ownership is checked before anything is read: phone tracking by
// the verified phone (trackingScope), the account by customerId, staff by
// organization.
import { z } from "zod";
import prisma from "../../config/database.js";
import { trackingScope } from "../../utils/publicOrganization.js";
import { sendRefusal, withLockedRequest, auditInTransaction } from "../contact-request-workflow/workflow-lock.js";
import { getReceiptFile } from "../payment-receipts/payment-receipts.service.js";
import { resendPaymentReceiptEmail } from "../customer-messages/customer-messages.service.js";
import { recordAccountFlightChoice, recordMyFlightChoice } from "./linked-flight.service.js";

const choiceSchema = z.object({ choice: z.enum(["REQUEST", "BOOKED", "LATER"]) });
const resendSchema = z.object({ email: z.string().trim().email("بريد إلكتروني غير صالح").max(200).optional() });

async function sendReceipt(res, contactRequestId) {
  const file = await getReceiptFile(contactRequestId);
  if (!file) return res.status(404).json({ success: false, code: "RECEIPT_NOT_READY", message: "إيصال السداد غير جاهز بعد." });
  return res.download(file.absolutePath, file.fileName, { headers: { "Content-Type": "application/pdf" } });
}

export async function downloadMyReceipt(req, res, next) {
  try {
    const owned = await prisma.contactRequest.findFirst({ where: { id: req.params.id, ...trackingScope(req.trackingPhone) }, select: { id: true } });
    if (!owned) return res.status(404).json({ success: false, message: "Not found" });
    return sendReceipt(res, owned.id);
  } catch (error) {
    next(error);
  }
}

export async function downloadAccountReceipt(req, res, next) {
  try {
    const owned = await prisma.contactRequest.findFirst({ where: { id: req.params.id, customerId: req.customer.id }, select: { id: true } });
    if (!owned) return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    return sendReceipt(res, owned.id);
  } catch (error) {
    next(error);
  }
}

export async function downloadStaffReceipt(req, res, next) {
  try {
    const owned = await prisma.contactRequest.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId }, select: { id: true } });
    if (!owned) return res.status(404).json({ success: false, message: "Contact request not found" });
    return sendReceipt(res, owned.id);
  } catch (error) {
    next(error);
  }
}

const RESEND_ERRORS = {
  NO_RECEIPT: [404, "لا يوجد إيصال سداد لهذا الطلب."],
  SENDING: [409, "الإرسال جارٍ الآن؛ حدّث الصفحة بعد قليل."],
  INVALID_RECIPIENT: [400, "بريد إلكتروني غير صالح."],
};

// Staff re-send (any state, including already accepted), audited with who,
// the previous state and any address correction.
export async function resendReceipt(req, res, next) {
  try {
    const parsed = resendSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
    const owned = await prisma.contactRequest.findFirst({ where: { id: req.params.id, organizationId: req.user.organizationId }, select: { id: true } });
    if (!owned) return res.status(404).json({ success: false, message: "Contact request not found" });
    const result = await resendPaymentReceiptEmail(owned.id, { recipient: parsed.data.email });
    if (result.error) {
      const [status, message] = RESEND_ERRORS[result.error];
      return res.status(status).json({ success: false, code: result.error, message });
    }
    await withLockedRequest(owned.id, { organizationId: req.user.organizationId }, (tx, request) =>
      auditInTransaction(tx, {
        userId: req.user.id,
        action: "PAYMENT_RECEIPT_EMAIL_RESENT",
        entityId: owned.id,
        organizationId: request.organizationId,
        oldValue: result.previous,
        newValue: { status: result.delivery?.status, recipient: result.delivery?.recipient },
      })
    );
    return res.json({ success: true, data: result.delivery });
  } catch (error) {
    next(error);
  }
}

function answerChoice(res, result) {
  if (result.refusal) return sendRefusal(res, result.refusal);
  if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "الطلب غير موجود" });
  return res.json({ success: true, data: result });
}

export async function postMyFlightChoice(req, res, next) {
  try {
    const parsed = choiceSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "اختيار غير صالح." });
    return answerChoice(res, await recordMyFlightChoice(req.trackingPhone, req.params.id, parsed.data.choice));
  } catch (error) {
    next(error);
  }
}

export async function postAccountFlightChoice(req, res, next) {
  try {
    const parsed = choiceSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "اختيار غير صالح." });
    return answerChoice(res, await recordAccountFlightChoice(req.customer.id, req.params.id, parsed.data.choice));
  } catch (error) {
    next(error);
  }
}
