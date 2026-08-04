"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-full"
    >
      {/* resolvedTheme is undefined on the server/first paint, so this icon
          can legitimately swap once the client resolves the real theme —
          suppress the (harmless, expected) hydration warning for it rather
          than delaying the render with a mounted-flag effect. */}
      <span suppressHydrationWarning>
        {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </span>
    </Button>
  );
}
