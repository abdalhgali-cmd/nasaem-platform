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
- **Branding**: the real logo (`public/logo.png`, background removed) is
  used in the header/footer via `src/components/logo.tsx`. It swaps to
  `public/logo-dark.png` — the same art with the navy wordmark recolored to
  white — in dark mode, since navy-on-near-black loses contrast; the icon
  artwork itself is unchanged between the two. `favicon.ico`, `icon.png`,
  `apple-icon.png` (static files under `src/app/`) and `opengraph-image.png`
  are all derived from the same logo, cropped/composited with Pillow rather
  than generated via `next/og` — Satori (the `next/og` renderer) can't
  shape connected Arabic text, so reusing the pre-rendered logo art sidesteps
  that entirely. The homepage services section
  (`src/components/sections/services.tsx`) uses matching branded icons from
  `public/icons/` instead of Lucide for that one section.
- **Staff-editable branding**: the logo and the six services-section icons
  can also be replaced live from the staff back-office (`../backend`'s
  "الهوية والأيقونات" tab) — no redeploy of this site needed. `src/lib/
  site-assets.ts` fetches `GET {NEXT_PUBLIC_API_URL}/site-assets` (public,
  no auth) with `next: { revalidate: 60 }`, and `logo.tsx`/`services.tsx`
  render whichever URL it returns for a given slot via a plain `<img>`
  (next/image's optimizer only handles local files or hosts listed in
  `remotePatterns`, so dynamic backend-hosted images intentionally skip it)
  — falling back to the bundled defaults above when nothing's been
  uploaded for that slot, or the backend is unreachable (the fetch never
  throws). A replacement takes effect on this site within about a minute.

## Content that needs real values before shipping

`src/lib/site-config.ts` holds the real business contact details (phone,
address, email); social links are intentionally empty until real profile
URLs are provided (the footer hides that row when empty). Package prices,
flight routes, and hotel listings across the section components are still
illustrative placeholders.

The contact form (`src/components/sections/contact-form.tsx`) posts to the
staff back-office API's public `/contact-requests` endpoint (see
`../backend`). Set `NEXT_PUBLIC_API_URL` (see `.env.example`) to that API's
base URL — defaults to `http://localhost:5000/api` for local dev. The
backend must allow this site's origin via its own `CORS_ORIGIN` env var.
