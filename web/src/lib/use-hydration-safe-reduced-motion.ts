"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Framer Motion's useReducedMotion() reads a browser media query. During SSR
 * that preference is unavailable, so branching on it during the first render
 * can make the server markup differ from the browser's hydration render.
 *
 * useSyncExternalStore lets the first client render intentionally reuse the
 * server snapshot (false) and only exposes the real browser preference after
 * hydration has completed. That keeps SSR/client markup deterministic without
 * disabling reduced-motion support.
 */
export function useHydrationSafeReducedMotion() {
  const prefersReducedMotion = useReducedMotion();
  const hydrated = React.useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  return hydrated && Boolean(prefersReducedMotion);
}
