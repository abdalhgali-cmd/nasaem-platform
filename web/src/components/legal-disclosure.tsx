import Link from "next/link";

export function LegalDisclosure({ sensitive = false }: { sensitive?: boolean }) {
  return (
    <p className="text-xs leading-6 text-muted-foreground">
      {sensitive
        ? "تُستخدم المستندات التي ترفعها لتنفيذ طلبك فقط، ولا يطّلع عليها إلا الموظفون المخوّلون."
        : "باستخدامك الخدمة فإنك توافق على الشروط، وتُستخدم بياناتك لتنفيذ طلبك فقط."}{" "}
      <Link href="/privacy" className="font-semibold text-primary underline underline-offset-4">سياسة الخصوصية</Link>
      {" و"}
      <Link href="/terms" className="font-semibold text-primary underline underline-offset-4">الشروط والأحكام</Link>
    </p>
  );
}
