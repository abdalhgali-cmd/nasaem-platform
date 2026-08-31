import type { Metadata } from "next";
import { siteConfig } from "./site-config";

/**
 * Shared shape for a service/category page's static metadata — adds the
 * canonical URL and OpenGraph fields every such page needs, so pages don't
 * each re-type the same `alternates`/`openGraph` boilerplate (and risk
 * drifting) around their own title/description.
 */
export function buildPageMetadata({
  path,
  title,
  description,
}: {
  /** Site-relative path, e.g. "/umrah" — resolved against the root layout's metadataBase. */
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: siteConfig.name },
  };
}
