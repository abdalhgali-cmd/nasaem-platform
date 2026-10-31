# Topbar

The top bar and page header frame every admin screen: breadcrumbs and global search on one side, notifications and the user on the other, then the page title with its primary actions.

- Height 64px, `surface` with a `line` bottom border; sticky at `z-topbar`.
- Breadcrumb: group › page, current page in `ink` bold. Separators are `chevron-left` (mirrors correctly in RTL).
- Global search (`nh-search`) looks up case reference, passport number or name; ⌘K / Ctrl K focuses it.
- Notification button shows the unread count from `/notifications?limit=1` (`meta.unreadCount`), capped "9+".
- Page header (`nh-pagehead`): `h1` style title, one-line description in `ink-muted`, max two actions with the primary last (leftmost in RTL).
- Logout lives in the user menu, not as a bare icon next to notifications.
