import { API_URL } from "./api-url";

export type ThemeColors = {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  background: string | null;
  text: string | null;
  button: string | null;
};

const EMPTY_THEME: ThemeColors = {
  primary: null,
  secondary: null,
  accent: null,
  background: null,
  text: null,
  button: null,
};

// #RRGGBB only, mirroring the backend validator. These values get
// interpolated into a raw <style> block in layout.tsx, so this is a
// defense-in-depth check against anything that reached the DB without
// going through the API's own validation.
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function sanitize(theme: ThemeColors): ThemeColors {
  const result = { ...theme };
  for (const key of Object.keys(result) as (keyof ThemeColors)[]) {
    if (result[key] && !HEX_COLOR_REGEX.test(result[key]!)) result[key] = null;
  }
  return result;
}

// Same resilience posture as getSiteAssetUrls()/getPublicHomepage(): a
// theme an admin hasn't customized yet (all null) or a backend that's
// briefly unreachable must never blank/break the site's styling — the
// caller renders overrides only for the colors that are actually set,
// leaving globals.css's defaults in place for the rest.
export async function getPublicTheme(): Promise<ThemeColors> {
  try {
    const res = await fetch(`${API_URL}/theme/public`, { next: { revalidate: 60 } });
    if (!res.ok) return EMPTY_THEME;
    const { data } = (await res.json()) as { data: ThemeColors };
    return data ? sanitize(data) : EMPTY_THEME;
  } catch {
    return EMPTY_THEME;
  }
}

const THEME_CSS_VARS: Record<keyof ThemeColors, string> = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  accent: "--color-accent",
  background: "--color-background",
  text: "--color-foreground",
  button: "--color-button",
};

// Builds a `:root { ... }` override block for only the colors an admin
// has actually set — every other design token keeps its globals.css
// default. Every value here already passed sanitize()'s hex-only check.
export function buildThemeOverrideCss(theme: ThemeColors): string {
  const declarations = (Object.keys(THEME_CSS_VARS) as (keyof ThemeColors)[])
    .filter((key) => theme[key])
    .map((key) => `${THEME_CSS_VARS[key]}: ${theme[key]};`);
  if (declarations.length === 0) return "";
  return `:root { ${declarations.join(" ")} }`;
}
