import { ICON_KEYS } from "../../utils/enums.js";

// Fixed allow-list of icon names a homepage section can reference. Matched
// client-side (web/src/lib/homepage-icons.ts) against a fixed map of actual
// Lucide components — validated here too so a section can never be saved
// pointing at an icon name the frontend has no component for. Re-exported
// from the shared list in utils/enums.js (also used by the service
// catalog) so both modules validate against the exact same set.
export const HOMEPAGE_ICON_KEYS = ICON_KEYS;

// Setting keys backing the homepage hero (a singleton — see
// HomepageSection's schema comment for why the hero isn't a table row).
export const HOMEPAGE_HERO_SETTING_KEYS = {
  title: "HOMEPAGE_HERO_TITLE",
  description: "HOMEPAGE_HERO_DESCRIPTION",
  ctaLabel: "HOMEPAGE_HERO_CTA_LABEL",
  ctaTarget: "HOMEPAGE_HERO_CTA_TARGET",
};

export const HOMEPAGE_HERO_IMAGE_KEY = "hero-image";
