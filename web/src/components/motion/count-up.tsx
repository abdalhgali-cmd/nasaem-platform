"use client";

import * as React from "react";
import { useInView, animate } from "framer-motion";
import { useHydrationSafeReducedMotion } from "@/lib/use-hydration-safe-reduced-motion";

export function CountUp({
  value,
  suffix = "",
  prefix = "",
  duration = 1.8,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const shouldReduceMotion = useHydrationSafeReducedMotion();
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    if (!isInView || shouldReduceMotion) return;

    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });

    return () => controls.stop();
  }, [isInView, value, duration, shouldReduceMotion]);

  // The hydration-safe preference remains false for the server render and the
  // first browser render. Reduced-motion users switch directly to the final
  // value only after hydration has completed.
  const shown = shouldReduceMotion && isInView ? value : display;

  return (
    <span ref={ref}>
      {prefix}
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
