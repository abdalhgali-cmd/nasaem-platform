# Sidebar

The sidebar is the admin's primary navigation: a deep navy rail with the brand mark, collapsible role-filtered groups, and the signed-in user.

## Anatomy
- **Brand**: the official emblem (`assets/Logos/nasaem-emblem.png`, transparent) on a white tile with a `gold-300` ring, the name "نسائم الحرمين" and "مركز التحكم" in `gold-300`.
- **Groups** (from `navigationGroups` in `admin-shell.tsx`): العمل اليومي، المال والتقارير، الخدمات والموقع، الفريق والنظام. Headings in the `overline` style; chevron shows open/closed. A group containing the active page is always open.
- **Item**: Lucide icon (16px, 1.75 stroke) + label + optional count. Active = `sidebar-active` fill, `sidebar-ink` text, gold icon and a 3px gold marker on the inline-start edge (right in RTL).
- **Counts**: neutral for informational (الإشعارات), `nh-count--danger` only for items with overdue work.
- **Foot**: the user's avatar, name and Arabic role label (`roleLabels`).

## Rules
- Width 272px desktop; below 1024px it becomes a drawer (`overlay` scrim, `radius-xl` edge, `z-drawer`) opened from the top bar menu button.
- Items the user's role cannot reach are removed, not disabled.
- Gold is used here for exactly one thing: what is active. Don't add gold elsewhere in the rail.
- Tokens: `sidebar-bg`, `sidebar-ink`, `sidebar-ink-muted`, `sidebar-hover`, `sidebar-active`, `sidebar-line`, `accent`.
