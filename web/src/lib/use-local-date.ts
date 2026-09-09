"use client";

import { useSyncExternalStore } from "react";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  window.addEventListener("focus", onChange);
  return () => { window.clearInterval(timer); window.removeEventListener("focus", onChange); };
}

// A stable server snapshot avoids mismatching the server timezone at hydration.
export function useLocalDate() {
  return useSyncExternalStore(subscribe, localDate, () => "");
}
