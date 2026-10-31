# Nasaem Al-Haramain Admin

**نسائم الحرمين للسفر والسياحة — Admin design system.** The visual language of the staff back-office (مركز التحكم) where the operations team runs Umrah groups and Egypt security-clearance cases. It is calm, trustworthy and dense: deep navy for authority, white for clarity, and gold used sparingly for the one thing that matters on each screen.

Built from the **official brand board, logo and letterhead** (navy `#2E3792`, gold `#FAB60D`, Kaaba charcoal `#3A3637`, display face HS Alwajd) and the live codebase (`abdalhgali-cmd/nasaem-platform`): `web/src/app/globals.css` (Cairo, theme structure), `web/src/components/admin/admin-shell.tsx` (navigation groups, roles, Lucide icons), `web/src/components/sections/case-workspace.tsx` (queues, SLA, document states, audit actions) and the legacy `web/public/assets/style.css` (status badge map, teal). It aligns the admin to the official brand colours (the site theme's `#0b3d91` / `#d4af37` drifted from the logo) and raises the finish: a navy rail instead of a white one, a stricter status colour map, a real data-table spec, tabular numerals and accessible contrast in both themes.

---

## 1. Principles

1. **Arabic first, RTL native.** Every layout is written with logical properties (`inline-start` = right). Latin data (passport numbers, references, amounts) is isolated LTR inside Arabic text, never the other way round.
2. **One gold thing per screen.** Gold is the brand's signature, so it is rationed: the active nav item, the current step of a case, the Umrah tag, a premium publish button. If two gold things compete, one of them is wrong.
3. **Status is a language, not decoration.** Five tones, one meaning each (see StatusBadge). Staff should know a case's state from across the room.
4. **Dense but breathable.** 14px body on a 24px line (Arabic needs the height for dots and diacritics), 48px table rows, 24px card padding.
5. **Trust is shown, not claimed.** Every sensitive action names its consequence, every rejection carries a reason, and clearance pages always state that the agency follows up and is not the issuing authority.

## 2. Content fundamentals

- **Language**: Modern Standard Arabic, plain and polite. Address staff directly ("لديك ١٢ حالة بحاجة لمراجعة"). Customer-facing strings stay formal.
- **Verbs on buttons**: "اعتماد الدفع"، "رفض المستند"، "إرسال تذكير" — verb + object. Never "موافق" / "نعم".
- **Statuses** come from the existing label maps (`statusLabel`, `QUEUE_LABEL`, `SLA_LABEL`, `DOCUMENT_STATUS_LABEL`, `ACTION_LABEL`). Never print a raw enum like `WAITING_DOCUMENTS` in the UI.
- **Numbers**: amounts, counts, references and times use Western digits in the `numeric` family (`1,284`, `45.00 USD`, `EG-2026-00418`) so tables align. Dates in running text may use Arabic-Indic digits ("٥ نوفمبر"); keep one convention per component.
- **Service names**: "الموافقة الأمنية لمصر" (Egypt security clearance), "عمرة" (Umrah), "مجموعات العمرة" (Umrah groups). Never abbreviate them in UI.
- **No emoji** anywhere in the admin.

## 3. Colour

The palette is the brand board's three colours (navy, gold, charcoal) on a cool neutral ground, plus five status tones and one service hue. The hex labels printed on the brand board (`#13368D`, `#EFE9E1`, `#E45A0B`) do not match its own swatches or the logo; the values below are sampled from the swatches and the logo artwork.

| Role | Token | Light | Dark | Use |
|---|---|---|---|---|
| Brand navy | `navy-700` / `primary` | `#2e3792` | `#4350c4` | Primary actions, links, active tabs, done steps |
| Deep navy | `navy-950` / `sidebar-bg` | `#10133a` | `#090b24` | Navigation rail, toasts, bulk bar |
| Brand gold | `gold-500` / `accent` | `#fab60d` | `#fab60d` | The one highlight per screen; text on it is `on-accent` |
| Kaaba charcoal | `charcoal` | `#3a3637` | `#3a3637` | Print, cover, emblem tone; never UI text |
| Gold text | `gold-700` / `accent-ink` | `#8a5f00` | `#fcd36a` | Gold words on white (5.6:1) |
| Canvas | `canvas` | `#f5f7fb` | `#070d1c` | Page ground behind cards |
| Surface | `surface` | `#ffffff` | `#0d1628` | Cards, tables, dialogs |
| Ink | `ink` / `ink-secondary` / `ink-muted` | `#0f1b2d` / `#3d4a5c` / `#5b6778` | `#e9eef7` / `#c3cde0` / `#9aa8c2` | Text hierarchy |
| Egypt line | `nile` | `#0f766e` | `#2dd4bf` | Egypt clearance tags and chart series (the legacy dashboard teal) |

Status tones each have a solid, a `-soft` ground and an `-ink` text: `info` (new / to review), `warning` (waiting on customer), `success` (done), `danger` (blocked / rejected); in-progress uses navy. All `-ink` on `-soft` pairs are ≥5.7:1 in both themes; solid fills carry white at ≥5:1.

**Rules**
- Text is always `ink*` on `canvas`/`surface`; never grey-on-grey below `ink-muted`.
- The brand gold is vivid. "Subtle" comes from rationing it and from the `gold-50`/`gold-100` tints, never from desaturating the brand value.
- Gold is never body text on white except as `accent-ink`. Gold fills always carry `on-accent` (dark) text.
- Service colour ≠ status colour: Egypt = `nile`, Umrah = `gold`, as square tags without a dot. Status badges are round with a dot.
- Charts: series order `navy-700`, `nile`, `gold-500`, `navy-200`; highlight one series, mute the rest.

## 4. Typography

**HS Alwajd** is the brand's display face (the wordmark and print titles, per the brand board). It is a commercial font and is not bundled here: use it in the logo artwork and in print or marketing where the licence covers it. **Cairo** carries all Arabic UI text (already used by the site, loaded from Google Fonts at 400–800); its open geometric forms sit well beside the Alwajd wordmark. **Inter** with tabular figures for numbers, KPIs and amounts. System mono for references.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 32 / 44 | 800 | Overview page title |
| `h1` | 24 / 36 | 800 | Page header |
| `h2` | 18 / 28 | 700 | Card titles |
| `h3` | 15 / 24 | 700 | Sub-sections, dialog titles |
| `body` | 14 / 24 | 400 | Default |
| `body-strong` | 14 / 24 | 600 | Names, primary cells |
| `small` | 13 / 20 | 500 | Helper text, secondary lines |
| `caption` | 12 / 18 | 600 | Column headers, badges |
| `overline` | 11 / 16 | 700 | Sidebar group headings (floor for Arabic) |
| `kpi` | 30 / 36 | 700 Inter | Stat values |
| `num` | 13 / 20 | 500 Inter | Table amounts and dates |
| `ref` | 12.5 / 20 | 600 mono | Case and passport references |

Arabic never goes below 11px, never uses letter-spacing, and never uses italics.

## 5. Layout, spacing, shape

- **Grid**: 4px base. `space-2` (8) inside controls, `space-4` (16) between cards, `space-6` (24) card padding and between sections, `space-8` (32) page gutter.
- **Shell**: 272px navy sidebar on the inline-start (right), 64px white top bar, content on `canvas`, max content width 1440px. Below 1024px the sidebar becomes a drawer.
- **Radius**: `radius-sm` 6 (badges), `radius-md` 10 (buttons, inputs, nav items), `radius-lg` 14 (cards, tables), `radius-xl` 20 (dialogs), `radius-full` (avatars, dots).
- **Elevation**: cards sit on `shadow-sm` + a `line` border; menus `shadow-md`; dialogs `shadow-lg`. Borders do the structural work; shadows only separate layers.
- **Motion**: 120–200ms colour/shadow transitions only. No entrance animations in the admin. Respect `prefers-reduced-motion`.

## 6. Iconography

**Lucide** (already a dependency as `lucide-react`), 16px at stroke 1.75 in UI, 20px in empty states and dialogs. One icon per concept, used consistently:

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Operations centre | `gauge` | Egypt clearance | `shield-check` |
| Case workspace | `clipboard-list` | Umrah | `sparkles` |
| Notifications | `bell` | Flight / travel | `plane`, `plane-takeoff` |
| Assignment | `user-round-cog` | Security authority | `landmark` |
| Documents | `file-check-2` | Approval issued | `stamp` |
| Passport | `id-card` | Payment | `wallet`, `credit-card` |
| Overdue | `triangle-alert` | Due today | `clock` |
| On time | `circle-check` | Waiting | `hourglass` |

- Icons are decorative (`aria-hidden`) when next to a label; icon-only buttons need `aria-label`.
- **RTL direction**: choose the RTL-correct glyph — "next / open" = `chevron-left`, "back" = `chevron-right`. Only `send` and `log-out` mirror automatically.
- The previews load Lucide path data through `components/bundle.js` (`NasaemDS.icon(name)` / `<i data-icon="name">`); in the app use `lucide-react` with `className="size-4"` and `strokeWidth={1.75}`.

## 7. Logo

The emblem (Kaaba inside a navy orbit, a departing plane and a gold arc) plus the Arabic wordmark "نسائم الحرمين" in navy over "للسفر والسياحة" in gold, set in HS Alwajd. All files are transparent PNGs extracted from the official logo PDF (see `assets/Logos/`).

- **Horizontal lockup** for headers, the login screen and documents; **stacked** for square spaces and social.
- **`-dark` variants** turn the navy parts white for navy or dark grounds; the gold line and the charcoal Kaaba stay.
- **Emblem alone** in the admin sidebar, on a white tile with a `gold-300` ring, beside the name set in Cairo 800.
- Clear space = the height of the gold line. Minimum emblem 24px; minimum lockup width 120px.
- Never recolour, outline, add effects, or put the light lockup on navy. The brand board's alternate colourways (navy on yellow, orange on navy) are for marketing, not the admin.
- The **brand pattern** (repeating emblems) is for print and marketing backgrounds, never behind data.
- The **agency seal (الختم)** is not part of the UI kit: keep it out of screens and templates, and apply it only through an approved document-issuing flow.

## 8. Accessibility

- Contrast: all text ≥4.5:1, control borders (`line-control`) and icons ≥3:1, in both themes.
- Focus: 2px `focus` outline at 2px offset on everything interactive; inputs use a `primary` border + `primary-soft` halo.
- Status is never colour-only: badges carry words, SLA carries an icon and words.
- Hit targets ≥32px in dense tables, ≥38px elsewhere.
- `lang="ar" dir="rtl"` on the root; arrow-key behaviour in tabs and pagers follows reading direction.

## 9. Using the components

The stylesheet `components/bundle.css` is plain CSS (`nh-` prefix) on top of `tokens.css`; each component's guideline explains its classes and the existing code it replaces. To adopt in the Next.js app, map the tokens into `globals.css` (`--color-primary: var(--navy-700)` …) and port the class recipes to Tailwind utilities. No business logic lives in the system: data, permissions and state stay with the existing components.
