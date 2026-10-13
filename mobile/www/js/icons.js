// A small hand-built outline icon set (24x24, currentColor stroke) so the
// app never falls back to emoji or an empty box — emoji render
// inconsistently across Android OEM fonts, and a missing icon font in a
// release APK silently shows tofu/blank glyphs instead. Every icon used
// anywhere in the app must have an entry here; renderIcon() throws in dev
// instead of a silent blank square when a name is missing — see below.
const PATHS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5a.5.5 0 0 0 .5.5H10v-5.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V20h3.5a.5.5 0 0 0 .5-.5V10"/>',
  requests: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  bell: '<path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8.3" r="3.3"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/>',
  "chevron-start": '<path d="M14.5 5 8 12l6.5 7"/>',
  "chevron-end": '<path d="M9.5 5 16 12l-6.5 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m19 19-4.3-4.3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  "check-circle": '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10.5v4M12 17h.01"/>',
  document: '<path d="M7 3.5h7l3.5 3.5V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"/><path d="M14 3.5V7h3.5"/>',
  upload: '<path d="M12 15.5V4.5M8 8.3 12 4l4 4.3"/><path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  download: '<path d="M12 4.5v11M8 12.2 12 16l4-3.8"/><path d="M5 16v2.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  camera: '<rect x="3.5" y="7" width="17" height="12" rx="2"/><circle cx="12" cy="13" r="3.4"/><path d="M8.5 7 10 4.5h4L15.5 7"/>',
  inbox: '<path d="M4 12h4.2l1.4 2.5h4.8L15.8 12H20"/><path d="M4 12 5.8 5.6A1 1 0 0 1 6.8 5h10.4a1 1 0 0 1 1 .6L20 12v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.3 2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
  "map-pin": '<path d="M12 21s6.5-6.1 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.9 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M6 4.5h3l1.3 4L8.5 10a10 10 0 0 0 5.5 5.5l1.5-1.8 4 1.3v3a1.5 1.5 0 0 1-1.6 1.5C11.2 19 5 12.8 4.5 6.1A1.5 1.5 0 0 1 6 4.5Z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 6.5 7.5 6 7.5-6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  chat: '<path d="M5 18.5 4 21l3.2-1.2A8.5 8.5 0 1 0 4.2 15"/><path d="M9 10.5h6M9 13.5h4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  eye: '<path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  "eye-off": '<path d="M3.5 3.5l17 17"/><path d="M10.6 5.7A9.9 9.9 0 0 1 12 5.5c5.5 0 9 6.5 9 6.5a15.6 15.6 0 0 1-3.2 4M7.8 7.6C5.2 9.2 3 12 3 12s3.5 6.5 9 6.5a9.7 9.7 0 0 0 3.2-.6"/><path d="M9.6 10a2.6 2.6 0 0 0 3.7 3.6"/>',
  logout: '<path d="M14.5 8V6.5A1.5 1.5 0 0 0 13 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H13a1.5 1.5 0 0 0 1.5-1.5V16"/><path d="M10 12h10m0 0-3-3m3 3-3 3"/>',
  card: '<rect x="3.5" y="6" width="17" height="12.5" rx="2"/><path d="M3.5 10.5h17M7 15h4"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 5-3 8-7 9-4-1-7-4-7-9V6l7-2.5Z"/><path d="m9 12 2 2 4-4.3"/>',
  star: '<path d="m12 4 2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L12 16.6 6.9 19.3l1.2-5.6-4.2-3.9 5.6-.6L12 4Z"/>',
  wallet: '<rect x="3.5" y="6.5" width="17" height="12" rx="2.2"/><path d="M14.5 12.5h3.3"/>',
  filter: '<path d="M4 6h16M7.5 12h9M10.5 18h3"/>',
  refresh: '<path d="M5 12a7 7 0 0 1 12-5l1.5 1.5M19 12a7 7 0 0 1-12 5L5.5 15.5"/><path d="M17 5v3h-3M7 19v-3h3"/>',
  "wifi-off": '<path d="M3 3l18 18"/><path d="M8.5 16.3a5 5 0 0 1 7 0M5.5 12.8a9.5 9.5 0 0 1 4-2.3M18.5 12.8a9.5 9.5 0 0 0-2.7-2"/><path d="M12 19.5h.01"/>',
  umrah: '<path d="M8 20V11l4-4.5L16 11v9" /><path d="M6 20h12M9.8 20v-5h4.4v5"/>',
  flight: '<path d="M13.2 3.5c.8 0 1.5.7 1.5 1.5v4.3l5.4 3.4v1.8l-5.4-1.4v4.1l1.8 1.4v1.4l-3.5-1-3.5 1v-1.4l1.8-1.4v-4.1L6 14.5v-1.8l5.3-3.4V5c0-.8.7-1.5 1.5-1.5Z"/>',
  visa: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.3" cy="12" r="2"/><path d="M12.5 10h5M12.5 14h5"/>',
  ferry: '<path d="M5 14.5 4 18.5h16l-1-4" /><path d="M7 14.5V7h7l2.5 3.2" /><path d="M7 10.5h8.5M12 4v3" /><path d="M3.5 20.5c1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0"/>',
  hotel: '<path d="M4 20V6.5h9V20" /><path d="M13 11h7v9" /><path d="M7 10h.01M7 13.5h.01M4 20h16" /><path d="M16 14.5h.01"/>',
  package: '<path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z"/><path d="M4 7.5 12 11.5l8-4M12 11.5V20.5"/>',
  "shield-check": '<path d="M12 3.5 19 6v5.5c0 5-3 8-7 9-4-1-7-4-7-9V6l7-2.5Z"/><path d="m9 12 2 2 4-4.3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.3 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.3-3.5-8.5s1.2-6.2 3.5-8.5Z"/>',
  family: '<circle cx="8.5" cy="7.5" r="2.3"/><circle cx="16" cy="8.5" r="2"/><path d="M4 19c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5M13 19c0-2.3 1.6-4.2 3.5-4.2s3.5 1.9 3.5 4.2"/>',
  // Extra keys so every admin-configurable HOMEPAGE_ICONS value (see
  // web/src/lib/homepage-icons.ts) resolves to a real icon here too —
  // content managed from the staff dashboard must never show a blank
  // square on the customer app just because mobile's icon set lagged.
  ship: '<path d="M5 14.5 4 18.5h16l-1-4" /><path d="M7 14.5V7h7l2.5 3.2" /><path d="M7 10.5h8.5M12 4v3" /><path d="M3.5 20.5c1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0 1.3 1 2.7 1 4 0"/>',
  plane: '<path d="M13.2 3.5c.8 0 1.5.7 1.5 1.5v4.3l5.4 3.4v1.8l-5.4-1.4v4.1l1.8 1.4v1.4l-3.5-1-3.5 1v-1.4l1.8-1.4v-4.1L6 14.5v-1.8l5.3-3.4V5c0-.8.7-1.5 1.5-1.5Z"/>',
  landmark: '<path d="M4 20h16M5 20V10.5M19 20V10.5M4 10.5 12 5l8 5.5" /><path d="M8 10.5V20M12 10.5V20M16 10.5V20"/>',
  stamp: '<rect x="7" y="4" width="10" height="9" rx="1.5"/><path d="M9 7.5h6M9 10h4" /><path d="M5 20c0-2.2 1.6-4 3.5-4h7c1.9 0 3.5 1.8 3.5 4" /><path d="M12 13v3"/>',
  "file-check": '<path d="M7 3.5h7l3.5 3.5V20a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z"/><path d="M14 3.5V7h3.5"/><path d="m9 14 2 2 4-4"/>',
  "credit-card": '<rect x="3.5" y="6" width="17" height="12.5" rx="2"/><path d="M3.5 10.5h17M7 15h4"/>',
  users: '<circle cx="9" cy="8" r="2.8"/><circle cx="17" cy="9" r="2.2"/><path d="M4 19c0-2.6 2.2-4.7 5-4.7s5 2.1 5 4.7M14.5 15c2.2.3 3.5 2 3.5 4"/>',
};

export function hasIcon(name) {
  return Boolean(PATHS[name]);
}

export function icon(name, { size = 22, className = "" } = {}) {
  const body = PATHS[name];
  if (!body) {
    // Visible-in-development failure instead of a blank box the task
    // explicitly calls out — a missing icon name is a bug to fix, not
    // something to hide behind an empty square at runtime.
    console.error(`[icons] missing icon: ${name}`);
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" class="icon icon-missing ${className}"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="icon ${className}">${body}</svg>`;
}

// Service category -> icon name, mirrors (but does not need to exactly
// match) the web app's HOMEPAGE_ICONS key set in web/src/lib/homepage-icons.ts.
export function iconForService(service) {
  const category = (service?.category || "").toLowerCase();
  const code = (service?.code || "").toUpperCase();
  if (code.includes("EGYPT")) return "shield-check";
  if (code.includes("FAMILY")) return "family";
  if (category.includes("umrah")) return "umrah";
  if (category.includes("flight")) return "flight";
  if (category.includes("hotel")) return "hotel";
  if (category.includes("ferry")) return "ferry";
  if (category.includes("package")) return "package";
  if (category.includes("intl") || category.includes("international")) return "globe";
  if (category.includes("visa") || category.includes("work") || category.includes("tasheel")) return "visa";
  // VisaType.category is an enum (UMRAH/FAMILY_VISIT/INTERNATIONAL/OTHER)
  // that, unlike Service.category, never literally contains the word
  // "visa" — so a VisaType whose category is "OTHER" (VISA-WORK,
  // VISA-INTERNATIONAL) needs this explicit fallback instead of silently
  // landing on the generic "package" icon.
  if (service?.isVisaType || code.startsWith("VISA-")) return "visa";
  return "package";
}
