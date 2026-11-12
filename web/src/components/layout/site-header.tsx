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
        "sticky top-0 z-40 w-full border-b transition-[box-shadow,border-color,background-color] duration-300",
        scrolled
          ? "bg-glass border-border/80 shadow-[0_6px_24px_-16px_rgb(7_31_79/0.35)]"
          : "border-border/60 bg-background"
      )}
    >
      <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
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
                  "relative rounded-full px-3.5 py-2 text-sm font-bold transition-colors",
                  active
                    ? "bg-primary/[0.07] text-primary dark:bg-secondary/10 dark:text-secondary"
                    : "text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {active ? (
                  <span className="absolute inset-x-4 -bottom-[1.15rem] h-0.5 rounded-full bg-accent" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 xl:flex">
          <a
            href={`tel:${(contactPhone ?? siteConfig.phone).replace(/\s/g, "")}`}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-foreground/75 transition hover:text-primary"
          >
            <Phone className="size-4 text-accent" />
            <span dir="ltr">{contactPhone ?? siteConfig.phone}</span>
          </a>
          <ThemeToggle />
          <Button asChild variant="gold" size="default">
            <Link href="/#start-request">ابدأ طلبك</Link>
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
                  <Link href="/#start-request">ابدأ طلبك</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
