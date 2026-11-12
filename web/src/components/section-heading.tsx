import { cn } from "@/lib/utils";
import { FadeIn } from "@/components/motion/fade-in";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <FadeIn
      className={cn(
        "mx-auto max-w-2xl",
        align === "center" ? "text-center" : "text-start max-w-none",
        className
      )}
    >
      {eyebrow ? (
        <p className="eyebrow mb-3">{eyebrow}</p>
      ) : null}
      <h2 className="text-balance text-2xl font-extrabold leading-snug text-foreground sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-3 text-balance text-sm leading-7 text-muted-foreground sm:text-base">
          {description}
        </p>
      ) : null}
    </FadeIn>
  );
}
