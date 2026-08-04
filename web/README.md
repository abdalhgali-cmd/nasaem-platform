# Nasaem Al-Haramain — Marketing Website

Public marketing/booking site for نسائم الحرمين للسفر والسياحة (Nasaem
Al-Haramain Travel & Tourism), built with Next.js 16 (App Router), React 19,
TypeScript, Tailwind CSS v4, and Framer Motion.

This is a separate app from `../backend` (the staff API) and `../frontend`
(the staff back-office UI) — this one is the public-facing site for
customers, in Arabic (RTL).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack notes

- **App Router, Server Components by default** — only components that need
  interactivity (`"use client"`) are the header, theme toggle, booking
  search widget, contact form, and Framer Motion wrappers.
- **Tailwind v4** — theme tokens (brand colors, fonts, dark mode) are defined
  in `src/app/globals.css` via `@theme`/`@custom-variant`, not a
  `tailwind.config.js`.
- **UI primitives** (`src/components/ui/`) are hand-written in the shadcn/ui
  pattern (Radix primitives + `class-variance-authority` + Tailwind) rather
  than pulled from the `shadcn` CLI registry, which wasn't reachable from
  this environment.
- **No external images** — visuals are gradients/glassmorphism + Lucide
  icons rather than stock photography (also unreachable from this
  environment at build time). Swap in real photography via `next/image`
  where desired; `next.config.ts` has no `remotePatterns` configured yet, so
  add your image host there first.
- **Dark mode** via `next-themes`, class-based, with a header toggle.
- Branded favicon/apple-icon/Open Graph image are generated at build time
  via `next/og` (`src/app/icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`)
  — no image assets needed. Note: the OG image renderer (Satori) can't
  currently shape connected Arabic text, so it uses the Latin brand name;
  the rest of the site is Arabic throughout.

## Content that needs real values before shipping

`src/lib/site-config.ts` holds placeholder contact details (phone, WhatsApp
number, email, address, social links) — replace these with the real
business information. Package prices, flight routes, and hotel listings
across the section components are illustrative placeholders too.

The contact form (`src/components/sections/contact-form.tsx`) simulates
submission client-side — there's no backend endpoint wired up. Point it at
a real API route (or the staff back-office API in `../backend`) before
relying on it.
