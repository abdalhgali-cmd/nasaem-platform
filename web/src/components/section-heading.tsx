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
        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-bold tracking-wide text-accent-foreground/80 dark:text-accent">
          <span className="size-1.5 rounded-full bg-accent" />
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-balance text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
          {description}
        </p>
      ) : null}
    </FadeIn>
  );
}
