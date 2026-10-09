// One way to submit a service request (POST /contact-requests), for the
// generic intake form and the hotel / ferry forms alike. Works the same with
// or without an account (the backend attaches the customer when signed in).
//
// Every form keeps one submissionKey for as long as it is on screen and
// sends it on every attempt: if a response is lost after the server stored
// the request, the retry returns that same request instead of a duplicate.
import { api, apiUpload, ApiError } from "./api.js";
import { submissionOutcome, newSubmissionKey } from "./experience-core.js";
import { go } from "./router.js";

export { newSubmissionKey };

const NOT_CONFIRMED_MESSAGE = "لم نتمكن من تأكيد حفظ طلبك ولم يصدر رقم مرجعي. أعد المحاولة أو تواصل معنا عبر واتساب.";

function requireStored(body) {
  const outcome = submissionOutcome(body);
  if (!outcome.ok) throw new ApiError(NOT_CONFIRMED_MESSAGE, { status: 0, code: "NOT_CONFIRMED" });
  return outcome;
}

export async function submitRequestJson(payload, submissionKey) {
  const body = await api("/contact-requests", {
    method: "POST",
    body: JSON.stringify({ ...payload, submissionKey }),
    timeoutMs: 30000,
  });
  return requireStored(body);
}

export async function submitRequestForm(formData, submissionKey, onProgress) {
  formData.set("submissionKey", submissionKey);
  const body = await apiUpload("/contact-requests", formData, onProgress);
  return requireStored(body);
}

// What to tell the customer when a submission did not come back confirmed.
// The form keeps everything they typed; re-sending is safe (same key).
export function submitFailureMessage(error) {
  if (error instanceof ApiError && error.code === "NOT_CONFIRMED") return error.message;
  if (error instanceof ApiError && error.status === 0) {
    return "تعذر التأكد من وصول طلبك بسبب الاتصال. بياناتك ما زالت في النموذج؛ أعد الإرسال ولن يتكرر الطلب.";
  }
  if (error instanceof ApiError && error.status === 429) return "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد الإرسال.";
  return error?.message || "تعذر إرسال الطلب، حاول مرة أخرى.";
}

// The confirmation screen (screens/intake.js renderRequestSubmittedScreen).
export function showSubmitted(outcome, { serviceName, phone, travelerCount }) {
  go(
    "requestSubmitted",
    { id: outcome.id, customerConfirmation: outcome.customerConfirmation, serviceName, phone, travelerCount },
    { title: "تم استلام طلبك" }
  );
}
