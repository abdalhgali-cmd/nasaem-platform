"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  BadgePercent,
  CheckCircle2,
  FileCheck2,
  Hotel,
  LoaderCircle,
  Plane,
  Ship,
  Sparkles,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { formatPrice, hasPublishedPrice } from "@/lib/price";
import { resolveServiceHref } from "@/lib/service-routes";
import type { PublicCatalog, PublicService, PublicVisaType } from "@/lib/services";
import { cn } from "@/lib/utils";

type PathKey = "umrah" | "security" | "visas" | "flights" | "ferries" | "hotels" | "offers";
type CatalogItem = (PublicService | PublicVisaType) & { kind: "service" | "visaType" };
type PublicRequirement = { id: string; name: string; required: boolean; type?: string };

const paths: { key: PathKey; label: string; icon: LucideIcon }[] = [
  { key: "umrah", label: "العمرة", icon: Sparkles },
  { key: "security", label: "الموافقة الأمنية", icon: Stamp },
  { key: "visas", label: "التأشيرات", icon: FileCheck2 },
  { key: "flights", label: "الطيران", icon: Plane },
  { key: "ferries", label: "البواخر", icon: Ship },
  { key: "hotels", label: "الفنادق", icon: Hotel },
  { key: "offers", label: "العروض", icon: BadgePercent },
];

function withKinds(catalog: PublicCatalog) {
  return {
    services: catalog.services.map((item) => ({ ...item, kind: "service" as const })),
    visaTypes: catalog.visaTypes.map((item) => ({ ...item, kind: "visaType" as const })),
    packages: catalog.packages.map((item) => ({ ...item, kind: "service" as const })),
  };
}

function itemsForPath(path: PathKey, catalog: PublicCatalog): CatalogItem[] {
  const { services, visaTypes, packages } = withKinds(catalog);
  if (path === "umrah") {
    const umrahPackages = packages.filter((item) => item.category === "UMRAH_PACKAGE" || item.code.startsWith("SVC-UMRAH-"));
    return umrahPackages.length ? umrahPackages : services.filter((item) => item.code === "SVC-UMRAH");
  }
  if (path === "security") {
    const variants = visaTypes.filter((item) => item.code.startsWith("VISA-EGYPT-CLEARANCE-"));
    return variants.length ? variants : visaTypes.filter((item) => item.code === "VISA-EGYPT-CLEARANCE");
  }
  if (path === "visas") {
    return visaTypes.filter((item) => !item.code.includes("EGYPT-CLEARANCE") && item.code !== "VISA-UMRAH");
  }
  if (path === "offers") {
    return packages.filter((item) => item.category !== "UMRAH_PACKAGE" && !item.code.startsWith("SVC-UMRAH-"));
  }
  const category = path === "flights" ? "flight" : path === "ferries" ? "ferry" : "hotel";
  return services.filter((item) => item.category.toLowerCase().includes(category));
}

function itemHref(item: CatalogItem, path: PathKey) {
  if (path === "offers") return `/packages?package=${encodeURIComponent(item.code)}#book`;
  return resolveServiceHref(item);
}

export function BookingSearchWidget({ initialCatalog }: { initialCatalog: PublicCatalog }) {
  const reduceMotion = useReducedMotion();
  const [catalog, setCatalog] = React.useState(initialCatalog);
  const [path, setPath] = React.useState<PathKey>("umrah");
  const [selectedCode, setSelectedCode] = React.useState("");
  const [requirementResult, setRequirementResult] = React.useState<{ key: string; items: PublicRequirement[] }>({ key: "", items: [] });

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`${API_URL}/services/public`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch(`${API_URL}/services/public/packages`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ]).then(([catalogPayload, packagesPayload]) => {
      if (!active || !catalogPayload?.data) return;
      setCatalog({
        services: Array.isArray(catalogPayload.data.services) ? catalogPayload.data.services : [],
        visaTypes: Array.isArray(catalogPayload.data.visaTypes) ? catalogPayload.data.visaTypes : [],
        packages: Array.isArray(packagesPayload?.data) ? packagesPayload.data : [],
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const choices = React.useMemo(() => itemsForPath(path, catalog), [catalog, path]);
  const selected = choices.find((item) => item.code === selectedCode) ?? choices[0] ?? null;
  const selectedId = selected?.id;
  const selectedKind = selected?.kind;

  React.useEffect(() => {
    if (!selectedId || !selectedKind) return;
    let active = true;
    const key = `${selectedKind}:${selectedId}`;
    const scope = selectedKind === "visaType" ? "visa-types" : "services";
    fetch(`${API_URL}/${scope}/${selectedId}/requirements/public`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active) return;
        const items = Array.isArray(payload?.data) ? payload.data : [];
        setRequirementResult({
          key,
          items: items.filter((item: PublicRequirement) => item.required && (!item.type || item.type === "DOCUMENT")).slice(0, 4),
        });
      })
      .catch(() => active && setRequirementResult({ key, items: [] }));
    return () => { active = false; };
  }, [selectedId, selectedKind]);

  const fixedPriceUnavailable = selected?.pricingMode === "FIXED" && !hasPublishedPrice(selected.basePrice);
  const href = selected ? itemHref(selected, path) : "#";
  const requirementKey = selected ? `${selected.kind}:${selected.id}` : "";
  const loadingRequirements = Boolean(selected && requirementResult.key !== requirementKey);
  const requirements = requirementResult.key === requirementKey ? requirementResult.items : [];

  return (
    <div id="start-request" className="bg-glass w-full max-w-5xl scroll-mt-24 rounded-[2rem] border border-white/20 p-3 text-right shadow-2xl shadow-primary/20 sm:p-5">
      <div className="px-2 pb-4 sm:px-3">
        <p className="text-lg font-extrabold text-foreground">اختر خدمتك</p>
        <p className="mt-1 text-sm text-muted-foreground">السعر والمستندات من كتالوج نسائم الحرمين مباشرة.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="tablist" aria-label="اختيار مسار الخدمة">
        {paths.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={path === key}
            aria-controls="service-selection-panel"
            onClick={() => { setPath(key); setSelectedCode(""); }}
            className={cn(
              "flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-bold transition",
              path === key
                ? "border-primary bg-primary text-primary-foreground shadow-md"
                : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <motion.div
        id="service-selection-panel"
        role="tabpanel"
        key={path}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className="mt-3 rounded-3xl border border-border bg-card p-4 sm:p-6"
      >
        {!selected ? (
          <div className="py-8 text-center">
            <p className="font-bold text-foreground">لا توجد خيارات منشورة لهذا المسار حاليًا</p>
            <p className="mt-2 text-sm text-muted-foreground">ستظهر هنا فور تفعيلها من كتالوج الإدارة.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.65fr)] lg:items-start">
            <div>
              {choices.length > 1 ? (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-muted-foreground">النوع</span>
                  <select
                    value={selected.code}
                    onChange={(event) => setSelectedCode(event.target.value)}
                    className="h-12 w-full rounded-xl border border-border bg-background px-3 font-bold text-foreground outline-none focus:border-primary"
                  >
                    {choices.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}
                  </select>
                </label>
              ) : null}

              <div className={cn("flex items-start justify-between gap-4", choices.length > 1 && "mt-5")}>
                <div>
                  <h2 className="text-xl font-extrabold text-foreground">{selected.name}</h2>
                  {selected.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{selected.description}</p> : null}
                </div>
                <div className="shrink-0 rounded-2xl bg-primary/5 px-3 py-2 text-left">
                  <span className="block text-[11px] font-bold text-muted-foreground">السعر</span>
                  <strong className={cn("mt-0.5 block text-sm", fixedPriceUnavailable ? "text-destructive" : "text-primary dark:text-secondary")} dir="ltr">
                    {selected.pricingMode === "FIXED"
                      ? (fixedPriceUnavailable ? "غير متاح للحجز" : formatPrice(selected.basePrice, selected.currency))
                      : "بعد مراجعة الطلب"}
                  </strong>
                  {selected.pricingMode === "FIXED" && selected.priceUnit === "PER_TRAVELER" ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">لكل مسافر</span>
                  ) : null}
                </div>
              </div>

              <Button asChild={!fixedPriceUnavailable} disabled={fixedPriceUnavailable} variant="gold" size="lg" className="mt-6 w-full sm:w-auto">
                {fixedPriceUnavailable ? (
                  <span>غير متاح للحجز</span>
                ) : (
                  <Link href={href}>
                    ابدأ الطلب
                    <ArrowLeft className="size-4" aria-hidden="true" />
                  </Link>
                )}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">يمكنك بدء الطلب كزائر دون إنشاء حساب.</p>
            </div>

            <div className="rounded-2xl bg-section p-4" aria-live="polite">
              <p className="text-sm font-extrabold text-foreground">المستندات الأساسية</p>
              {loadingRequirements ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> جارٍ التحديث…</p>
              ) : requirements.length ? (
                <ul className="mt-3 space-y-2" data-testid="homepage-required-documents">
                  {requirements.map((requirement) => (
                    <li key={requirement.id} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary dark:text-secondary" aria-hidden="true" />
                      <span>{requirement.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">لا توجد مستندات أساسية منشورة لهذا الخيار.</p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
