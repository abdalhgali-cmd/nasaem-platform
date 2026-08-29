import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  Globe2,
  Hotel,
  Landmark,
  MapPin,
  Package,
  Plane,
  ShieldCheck,
  Ship,
  Stamp,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

// Must match backend/src/modules/homepage/homepage.constants.js's
// HOMEPAGE_ICON_KEYS exactly — the backend validates a section's iconKey
// against that same fixed list, so every key it can ever accept has a
// component here.
export const HOMEPAGE_ICONS: Record<string, LucideIcon> = {
  ship: Ship,
  landmark: Landmark,
  stamp: Stamp,
  plane: Plane,
  hotel: Hotel,
  globe: Globe2,
  package: Package,
  "shield-check": ShieldCheck,
  "map-pin": MapPin,
  "file-check": FileCheck,
  "credit-card": CreditCard,
  users: Users,
  star: Star,
  clock: Clock,
  "check-circle": CheckCircle2,
};

export function resolveHomepageIcon(key: string | null | undefined, fallback: LucideIcon = Package): LucideIcon {
  if (!key) return fallback;
  return HOMEPAGE_ICONS[key] ?? fallback;
}
