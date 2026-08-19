import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Ambient gradient blobs + subtle geometric pattern used behind sections in
 * place of stock photography (no reliable external image source in this
 * environment) — keeps the "premium travel" feel via color/light instead.
 */
export function GradientBackdrop({
  variant = "light",
  className,
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  // Multiple instances of this component can render on the same page (e.g.
  // Hero + Stats), so the pattern id can't be a hardcoded literal — that
  // produced duplicate `id="star-pattern"` nodes and an ambiguous `url(#...)`
  // reference. useId() is SSR/hydration-safe by construction and gives each
  // instance its own id, matching between server and client.
  const patternId = useId();

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
        className={cn(
          "absolute -top-24 -start-24 size-[420px] rounded-full blur-3xl",
          variant === "dark" ? "bg-secondary/20" : "bg-secondary/25"
        )}
      />
      <div
        className={cn(
          "absolute top-1/3 -end-32 size-[480px] rounded-full blur-3xl",
          variant === "dark" ? "bg-accent/10" : "bg-accent/20"
        )}
      />
      <div
        className={cn(
          "absolute bottom-0 start-1/4 size-[360px] rounded-full blur-3xl",
          variant === "dark" ? "bg-primary/25" : "bg-primary/10"
        )}
      />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.05]"
        aria-hidden
      >
        <defs>
          <pattern
            id={patternId}
            width="56"
            height="56"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M28 8 L32 24 L48 28 L32 32 L28 48 L24 32 L8 28 L24 24 Z"
              fill="currentColor"
              className="text-primary"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
