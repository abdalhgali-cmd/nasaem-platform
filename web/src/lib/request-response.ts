type RequestPayload = {
  success?: boolean;
  data?: { id?: unknown };
  errors?: { fieldErrors?: Record<string, unknown> };
};

export const uncertainRequestMessage = "تعذر تأكيد استلام الطلب. احتفظ ببياناتك وتحقق من صفحة تتبع الطلب قبل إعادة الإرسال لتجنب تكراره.";

// Only a returned reference is proof that the API created a request.
// Do not expose proxy HTML, JSON parse errors or internal server messages.
export async function readRequestReference(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as RequestPayload | null;
  if (response.status === 429) throw new Error("طلبات كثيرة خلال وقت قصير. انتظر قليلًا قبل المحاولة مجددًا.");
  if (response.status === 400 || response.status === 422) {
    const fields = payload?.errors?.fieldErrors;
    if (fields?.email) throw new Error("تحقق من صحة البريد الإلكتروني، أو اتركه فارغًا إن لم يكن لديك بريد.");
    if (fields?.phone) throw new Error("تحقق من رقم الهاتف وأضف رمز الدولة.");
    if (fields?.name) throw new Error("أدخل الاسم الكامل، بحرفين على الأقل.");
    throw new Error("راجع البيانات المدخلة ثم حاول مرة أخرى.");
  }
  if (!response.ok || payload?.success === false || typeof payload?.data?.id !== "string" || !payload.data.id.trim()) {
    throw new Error(uncertainRequestMessage);
  }
  return payload.data.id;
}
