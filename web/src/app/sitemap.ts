import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

const routes = [
  "",
  // Approved customer scope only (see lib/active-services.ts).
  "/umrah",
  "/visas/egypt-security-approval",
  "/services",
  "/flights",
  "/ferries",
  "/hotels",
  "/visas",
  "/visas/saudi-family-visit",
  "/about",
  "/contact",
  "/track",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
  }));
}
