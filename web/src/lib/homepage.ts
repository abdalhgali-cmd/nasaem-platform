import { API_URL } from "./api-url";

export type HomepageHero = {
  title: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaTarget: string | null;
};

export type HomepageSectionRecord = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  href: string | null;
  iconKey: string | null;
  imageKey: string | null;
  sortOrder: number;
};

export type HomepagePublicData = {
  hero: HomepageHero;
  sections: HomepageSectionRecord[];
};

// Same resilience posture as getSiteAssetUrls(): server-side only, cached
// for a minute, and never throws — an admin who hasn't set anything yet
// (hero fields null, zero sections) or a backend that's briefly
// unreachable must never blank the homepage. Callers combine this with
// their own hardcoded fallback content for exactly that reason — see
// hero.tsx/services.tsx.
export async function getPublicHomepage(): Promise<HomepagePublicData> {
  const empty: HomepagePublicData = { hero: { title: null, description: null, ctaLabel: null, ctaTarget: null }, sections: [] };
  try {
    const res = await fetch(`${API_URL}/homepage/public`, { next: { revalidate: 60 } });
    if (!res.ok) return empty;
    const { data } = (await res.json()) as { data: HomepagePublicData };
    return data ?? empty;
  } catch {
    return empty;
  }
}
