"use client";

import * as React from "react";
import { useInView, useReducedMotion, animate } from "framer-motion";

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
  const shouldReduceMotion = useReducedMotion();
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

  // When motion is reduced, skip the animated state entirely and derive the
  // shown value straight from render instead of mirroring it into state.
  const shown = shouldReduceMotion && isInView ? value : display;

  return (
    <span ref={ref}>
      {prefix}
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
