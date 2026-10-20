import { sendRefusal } from "../contact-request-workflow/workflow-lock.js";
import { getPaymentAccessSummary, uploadReceiptWithPaymentAccess } from "./payment-access.service.js";
import { settlementChoiceOf } from "../payment-settlement/payment-settlement.service.js";

export const PAYMENT_ACCESS_HEADER = "x-payment-access";

const NOT_FOUND = {
  success: false,
  code: "PAYMENT_ACCESS_INVALID",
  message: "انتهت صلاحية رابط الدفع أو أنه غير صحيح. تابع الدفع من صفحة «تتبع الطلب» برقم هاتفك.",
};

function tokenOf(req) {
  return req.get(PAYMENT_ACCESS_HEADER) || "";
}

export async function getPaymentAccess(req, res, next) {
  try {
    const result = await getPaymentAccessSummary(req.params.id, tokenOf(req));
    if (result.error) return res.status(404).json(NOT_FOUND);
    return res.status(200).json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
}

export async function postPaymentAccessReceipt(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "ارفع صورة أو ملف PDF لإشعار التحويل" });
    const token = tokenOf(req);
    const result = await uploadReceiptWithPaymentAccess(req.params.id, token, req.file, settlementChoiceOf(req.body));
    if (result.refusal) return sendRefusal(res, result.refusal);
    if (result.error) return res.status(404).json(NOT_FOUND);
    const summary = await getPaymentAccessSummary(req.params.id, token);
    return res.status(201).json({
      success: true,
      message: "تم استلام إشعار التحويل، وهو الآن بانتظار مراجعة الموظف المختص",
      data: { document: { id: result.document.id, fileName: result.document.fileName }, request: summary.data ?? null },
    });
  } catch (error) {
    next(error);
  }
}
