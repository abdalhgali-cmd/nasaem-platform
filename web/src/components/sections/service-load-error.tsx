import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ServiceLoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p role="alert" className="text-sm leading-7">{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button type="button" variant="outline" onClick={retry}>إعادة تحميل الخدمة</Button>
        <Link href="/contact" className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline">تواصل معنا</Link>
      </div>
    </div>
  );
}
