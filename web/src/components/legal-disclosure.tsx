import Link from "next/link";

export function LegalDisclosure({ sensitive = false }: { sensitive?: boolean }) {
  return (
    <p className="text-xs leading-6 text-muted-foreground">
      {sensitive
        ? "رفع المستندات الحساسة يتطلب اعتماد سياسة الخصوصية وتعليمات الاحتفاظ والوصول قبل الإطلاق العام."
        : "راجع المعلومات القانونية قبل إرسال بيانات التواصل؛ النص النهائي سيُنشر بعد اعتماده من الجهة المسؤولة."}{" "}
      <Link href="/privacy" className="font-semibold text-primary underline underline-offset-4">سياسة الخصوصية</Link>
      {" و"}
      <Link href="/terms" className="font-semibold text-primary underline underline-offset-4">الشروط والأحكام</Link>
    </p>
  );
}
