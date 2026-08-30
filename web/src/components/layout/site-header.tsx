"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Phone } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { mainNav, siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

export function SiteHeader({
  logoUrls,
  contactPhone,
}: {
  logoUrls?: { light?: string; dark?: string };
  contactPhone?: string;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full transition-all duration-300",
        scrolled
          ? "bg-glass border-b border-border/70 shadow-sm"
          : "border-b border-transparent bg-background/0"
      )}
    >
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Logo urls={logoUrls} />

        <nav
          aria-label="التصفح الرئيسي"
          className="hidden items-center gap-1 xl:flex"
        >
          {mainNav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "text-primary dark:text-secondary"
                    : "text-foreground/80 hover:text-primary dark:hover:text-secondary"
                )}
              >
                {item.label}
                {active ? (
                  <span className="absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-accent" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          <a
            href={`tel:${(contactPhone ?? siteConfig.phone).replace(/\s/g, "")}`}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-foreground/80 transition hover:text-primary"
          >
            <Phone className="size-4" />
            <span dir="ltr">{contactPhone ?? siteConfig.phone}</span>
          </a>
          <ThemeToggle />
          <Button asChild variant="gold" size="default">
            <Link href="/contact">احجز الآن</Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 xl:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="فتح القائمة">
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>
                  <Logo urls={logoUrls} />
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="التصفح الرئيسي للجوال"
                className="mt-4 flex flex-1 flex-col gap-1"
              >
                {mainNav.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname?.startsWith(item.href);
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "rounded-2xl px-4 py-3 text-base font-semibold transition-colors",
                          active
                            ? "bg-primary/10 text-primary dark:text-secondary"
                            : "text-foreground/80 hover:bg-foreground/5"
                        )}
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
              <div className="mt-auto flex flex-col gap-3 border-t border-border pt-5">
                <a
                  href={`tel:${(contactPhone ?? siteConfig.phone).replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground/80"
                >
                  <Phone className="size-4" />
                  <span dir="ltr">{contactPhone ?? siteConfig.phone}</span>
                </a>
                <Button asChild variant="gold" size="lg" className="w-full">
                  <Link href="/contact">احجز الآن</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
