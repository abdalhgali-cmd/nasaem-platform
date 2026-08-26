"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme reflects the real (possibly system-dark) theme as soon as
  // next-themes hydrates client state, which can happen on the very first
  // client render — before that, `mounted` is still false here, so this
  // matches the server's always-light-icon output exactly. suppressHydration
  // Warning can't cover this: the icon swap (Sun vs Moon) changes the SVG's
  // child elements, and the aria-label lives on the outer, unsuppressed
  // Button, so a real mismatch reached React whenever the client's system
  // theme was dark. Gating on `mounted` keeps the first paint deterministic
  // and only reflects the resolved theme after hydration completes.
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-full"
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
