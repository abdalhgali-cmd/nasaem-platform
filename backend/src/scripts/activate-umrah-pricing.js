// Sets the owner-approved Umrah prices (decision 2026-10-28) on a STAGING (or
// local) API through the same validated, audited endpoint as the admin
// screen (PATCH /api/services/:id). Touches only the three Umrah types below:
// pricing mode, price, currency, unit and published state. Never their
// descriptions (INCLUDED/EXCLUDED), other services, requests or customers.
//
//   NASAEM_API_BASE=https://<staging-host>/api \
//   NASAEM_ADMIN_EMAIL=... NASAEM_ADMIN_PASSWORD=... \
//   node src/scripts/activate-umrah-pricing.js            # dry run: prints before / planned
//   node src/scripts/activate-umrah-pricing.js --apply    # applies, then re-reads and verifies
//
// Runs only against an exact, fixed allow-list of hosts: the staging API and
// the local machine. There is no override: a host merely containing
// "staging" is not enough, and redirects are refused so a request can never
// land on another host. (A local port forwarded to production is not
// detectable from here; the script also needs that environment's own admin
// account.)
// Prints no password, token or customer data.
const APPROVED = Object.freeze([
  { code: "SVC-UMRAH-VISA", label: "تأشيرة عمرة فقط", basePrice: 795 },
  { code: "SVC-UMRAH-AIR", label: "عمرة بالخدمات بالطيران", basePrice: 3500 },
  { code: "SVC-UMRAH-SEA", label: "عمرة بالخدمات بالبحر", basePrice: 2650 },
]);
const TARGET = { pricingMode: "FIXED", currency: "SAR", priceUnit: "PER_TRAVELER", active: true };
const FIELDS = ["pricingMode", "basePrice", "currency", "priceUnit", "active"];

const apply = process.argv.includes("--apply");
const base = String(process.env.NASAEM_API_BASE || "").replace(/\/+$/, "");
const email = process.env.NASAEM_ADMIN_EMAIL;
const password = process.env.NASAEM_ADMIN_PASSWORD;

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(1);
}

let host;
try {
  host = new URL(base).hostname;
} catch {
  fail("NASAEM_API_BASE must be the API base URL, e.g. https://<staging-host>/api");
}
const ALLOWED_HOSTS = new Set(["adaptable-quietude-staging.up.railway.app", "localhost", "127.0.0.1"]);
if (!ALLOWED_HOSTS.has(host)) fail(`${host} is not an allowed staging or local host`);
if (!email || !password) fail("NASAEM_ADMIN_EMAIL and NASAEM_ADMIN_PASSWORD are required (an ADMIN account of that environment)");

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    redirect: "error",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.code || ""} ${json.message || ""}`.trim());
  return json;
}

const view = (s) => (s ? Object.fromEntries(FIELDS.map((f) => [f, f === "basePrice" ? Number(s[f]) : s[f]])) : null);
const matches = (s, approved) => s && s.pricingMode === TARGET.pricingMode && Number(s.basePrice) === approved.basePrice && s.currency === TARGET.currency && s.priceUnit === TARGET.priceUnit && s.active === true;

async function readUmrah(token) {
  const list = (await call("/services?limit=200", { token })).data || [];
  return Object.fromEntries(APPROVED.map((a) => [a.code, list.find((s) => s.code === a.code) || null]));
}

const login = await call("/auth/login", { method: "POST", body: { email, password } });
const token = login.data?.token;
if (!token) fail("login answered without a token");

console.log(`target: ${host} — ${apply ? "APPLY" : "dry run (add --apply to change)"}`);
const before = await readUmrah(token);
for (const approved of APPROVED) {
  const row = before[approved.code];
  if (!row) fail(`${approved.code} does not exist on ${host} (run prisma/setup-umrah-packages.js there first; nothing changed)`);
  console.log(`${approved.code} ${approved.label}`);
  console.log(`  before:  ${JSON.stringify(view(row))}`);
  console.log(`  planned: ${JSON.stringify({ ...TARGET, basePrice: approved.basePrice })}${matches(row, approved) ? "  (already set)" : ""}`);
  const features = Array.isArray(row.features) ? row.features : [];
  console.log(`  description (unchanged): ${features.filter((f) => /^(KIND|INCLUDED|EXCLUDED):/.test(f)).join(" | ") || "none"}`);
}

try {
  const rates = (await call("/flights/admin/rates", { token })).data || {};
  console.log(`SAR→SDG exchange rate: ${Number(rates.SAR) > 0 ? `active (${rates.SAR})` : "not active — the SDG price will not be shown"}`);
} catch (error) {
  console.log(`SAR→SDG exchange rate: not readable (${error.message})`);
}

if (!apply) process.exit(0);

// One PATCH per package, not one transaction: if one fails, the ones before
// it stay applied. The script then still re-reads all three and reports each
// one's real state; running it again completes the rest.
let applyError = null;
for (const approved of APPROVED) {
  const row = before[approved.code];
  if (matches(row, approved)) continue;
  try {
    await call(`/services/${row.id}`, { method: "PATCH", token, body: { ...TARGET, basePrice: approved.basePrice } });
  } catch (error) {
    // The change may still have been saved (e.g. the response was lost): the
    // read-back below says what is really stored.
    applyError = error;
    process.exitCode = 1;
    console.error(`${approved.code}: outcome unknown (${error.message}); stopping, checking what is stored`);
    break;
  }
}

let after;
let published;
try {
  after = await readUmrah(token);
  published = (await call("/services/public/packages")).data || [];
} catch (error) {
  console.error(`could not re-read the packages (${error.message}): state unknown, run the dry run to see it`);
  process.exit(1);
}
let ok = true;
for (const approved of APPROVED) {
  const saved = matches(after[approved.code], approved);
  const pub = published.find((p) => p.code === approved.code);
  const visible = Boolean(pub) && pub.pricingMode === "FIXED" && Number(pub.basePrice) === approved.basePrice;
  ok = ok && saved && visible;
  console.log(`${approved.code}: saved ${saved ? "yes" : "NO"} · public ${visible ? "yes" : "NO"}${pub?.priceSdg ? ` · SDG ${pub.priceSdg}` : ""}`);
}
if (applyError || !ok) {
  console.error(applyError ? "partly applied: run again to complete (packages already set are left as is)" : "verification failed: check the rows above");
  process.exitCode = 1;
}
