import {
  requestCodeSchema,
  verifyCodeSchema,
} from "./contact-request-tracking.validators.js";
import {
  requestLoginCode,
  verifyLoginCode,
  listContactRequestsForPhone,
  approveInvoice,
  rejectInvoice,
  selectOffer,
  markTransferSent,
  uploadMyDocument,
  uploadPaymentReceipt as uploadPaymentReceiptService,
  getMyDocumentFile,
  getMyDeliverableFile,
} from "./contact-request-tracking.service.js";
import { listActivePaymentAccounts } from "../payment-accounts/payment-accounts.service.js";
import { uploadContactRequestDocumentSchema } from "../contact-request-documents/contact-request-documents.validators.js";
import { getTrackingTokenMaxAgeMs } from "../../utils/jwt.js";

const TRACKING_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" };

export async function requestCode(req, res, next) {
  try { const parsed = requestCodeSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() }); const { debugCode } = await requestLoginCode(parsed.data.phone); return res.status(200).json({ success: true, message: "إذا كان الرقم مسجلاً، سيصلك رمز التحقق عبر واتساب", ...(debugCode ? { debugCode } : {}) }); } catch (error) { next(error); }
}
export async function verifyCode(req, res, next) {
  try { const parsed = verifyCodeSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() }); const result = await verifyLoginCode(parsed.data.phone, parsed.data.code); if (!result.success) return res.status(400).json({ success: false, message: result.message }); res.cookie("trackingAccessToken", result.token, { ...TRACKING_COOKIE_OPTIONS, maxAge: getTrackingTokenMaxAgeMs() }); return res.status(200).json({ success: true, message: "تم تسجيل الدخول بنجاح" }); } catch (error) { next(error); }
}
export async function getMyRequests(req, res, next) { try { return res.status(200).json({ success: true, data: await listContactRequestsForPhone(req.trackingPhone) }); } catch (error) { next(error); } }
export async function getMyPaymentAccounts(req, res, next) { try { return res.status(200).json({ success: true, data: await listActivePaymentAccounts(req.query.currency?.trim() || undefined) }); } catch (error) { next(error); } }
function respondToAction(res, result, successMessage) { if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request or invoice not found" }); if (result.error === "INVALID_STATE") return res.status(409).json({ success: false, message: "This action isn't available for the request's current state" }); return res.status(200).json({ success: true, message: successMessage }); }
export async function approveMyInvoice(req, res, next) { try { return respondToAction(res, await approveInvoice(req.trackingPhone, req.params.id), "تمت الموافقة على السعر"); } catch (error) { next(error); } }
export async function rejectMyInvoice(req, res, next) { try { return respondToAction(res, await rejectInvoice(req.trackingPhone, req.params.id), "تم رفض عرض السعر"); } catch (error) { next(error); } }
export async function selectMyOffer(req, res, next) { try { return respondToAction(res, await selectOffer(req.trackingPhone, req.params.id, req.params.offerId), "تم اختيار هذا العرض"); } catch (error) { next(error); } }
export async function markMyTransferSent(req, res, next) { try { return respondToAction(res, await markTransferSent(req.trackingPhone, req.params.id), "تم إعلام فريقنا بالتحويل، سنراجعه قريبًا"); } catch (error) { next(error); } }
export async function uploadPaymentReceipt(req, res, next) { try { if (!req.file) return res.status(400).json({ success: false, message: "A file is required" }); const result = await uploadPaymentReceiptService(req.trackingPhone, req.params.id, req.file); if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" }); if (result.error === "INVALID_STATE") return res.status(409).json({ success: false, message: "Payment receipt can only be uploaded after the customer approves the price" }); return res.status(201).json({ success: true, message: "تم رفع إشعار الدفع", data: result.document }); } catch (error) { next(error); } }
// Platform 3.0 Phase 6: maps the requirement-validation error codes from
// createContactRequestDocument to a clean 400, mirroring the rest of this
// file's respondToAction-style short-circuits.
const UPLOAD_ERROR_MESSAGES = {
  REQUIREMENT_NOT_FOUND: "This requirement does not belong to the selected visa type",
  INVALID_MIME: "This file type isn't allowed for this requirement",
  FILE_TOO_LARGE: "This file exceeds the maximum size allowed for this requirement",
  MAX_FILES_REACHED: "The maximum number of files for this requirement has already been reached",
  // Smart Case Operations — Release A.
  TRAVELER_NOT_FOUND: "This traveler does not belong to this request",
};
export async function uploadDocument(req, res, next) { try { const parsed = uploadContactRequestDocumentSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() }); if (!req.file) return res.status(400).json({ success: false, message: "A file is required" }); const result = await uploadMyDocument(req.trackingPhone, req.params.id, { label: parsed.data.label, file: req.file, requirementId: parsed.data.requirementId, travelerId: parsed.data.travelerId }); if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" }); if (result.error && UPLOAD_ERROR_MESSAGES[result.error]) return res.status(400).json({ success: false, message: UPLOAD_ERROR_MESSAGES[result.error], details: result.details }); return res.status(201).json({ success: true, data: result.document }); } catch (error) { next(error); } }
export async function downloadMyDocumentFile(req, res, next) { try { const file = await getMyDocumentFile(req.trackingPhone, req.params.id, req.params.documentId); if (!file) return res.status(404).json({ success: false, message: "Document not found" }); return res.sendFile(file.absolutePath, { headers: { "Content-Type": file.mimeType } }); } catch (error) { next(error); } }
export async function downloadMyDeliverableFile(req, res, next) { try { const file = await getMyDeliverableFile(req.trackingPhone, req.params.id, req.params.deliverableId); if (!file) return res.status(404).json({ success: false, message: "Deliverable not found" }); return res.sendFile(file.absolutePath, { headers: { "Content-Type": file.mimeType } }); } catch (error) { next(error); } }
export async function logout(req, res, next) { try { res.clearCookie("trackingAccessToken", TRACKING_COOKIE_OPTIONS); return res.status(200).json({ success: true, message: "تم تسجيل الخروج" }); } catch (error) { next(error); } }
