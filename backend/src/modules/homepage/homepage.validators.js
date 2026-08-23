import { z } from "zod";
import { HOMEPAGE_ICON_KEYS } from "./homepage.constants.js";

// Sections link to internal routes only (/umrah, /flights, ...) — an
// absolute URL here would let a section CTA point anywhere, which is more
// than "where can this card link to" needs to allow.
const internalHref = z
  .string()
  .trim()
  .regex(/^\/[a-zA-Z0-9\-/_]*$/, "href must be an internal path starting with /")
  .max(200);

export const createSectionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "key must be lowercase letters, numbers and hyphens only"),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  href: internalHref.optional().nullable(),
  iconKey: z.enum(HOMEPAGE_ICON_KEYS).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  visible: z.coerce.boolean().optional(),
});

export const updateSectionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  href: internalHref.optional().nullable(),
  iconKey: z.enum(HOMEPAGE_ICON_KEYS).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  visible: z.coerce.boolean().optional(),
});

export const updateHeroSchema = z.object({
  title: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  ctaTarget: internalHref.optional().nullable(),
});
