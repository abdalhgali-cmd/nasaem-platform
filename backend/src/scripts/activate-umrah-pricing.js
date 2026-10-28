// Sets the owner-approved Umrah prices (decision 2026-10-28) on STAGING only.
//
//   NASAEM_API_BASE=https://adaptable-quietude-staging.up.railway.app/api \
//   NASAEM_ADMIN_EMAIL=... NASAEM_ADMIN_PASSWORD=... \
//   NASAEM_STAGING_ATTESTATION_KEY=...   (staging's ENVIRONMENT_ATTESTATION_KEY)
//   node src/scripts/activate-umrah-pricing.js            # dry run: verifies staging, prints before / planned
//   node src/scripts/activate-umrah-pricing.js --apply    # applies, then re-reads and verifies
//
// Production protection, in layers (owner decision 2026-10-28, option C):
// 1. A fixed host allow-list (the staging API, localhost, 127.0.0.1), HTTPS
//    for any non-local host, and no redirects.
// 2. The server must PROVE it is staging (modules/staging-ops/staging-guard.js):
//    it answers a fresh nonce with an HMAC only a server holding staging's
//    key can produce. A hostname, including localhost forwarded to
//    production, proves nothing; this does.
// 3. The write itself goes to a staging-only route that checks a signature
//    made with the same key on every request and applies the prices the
//    server holds, in one transaction. Production has no key, so it answers
//    404 even if a proxy routed this request there. The generic
//    PATCH /api/services is not used.
// Prints no password, token, key or customer data, and no server message
// text (status and code only).
import crypto from "node:crypto";

const APPROVED = Object.freeze([
  { code: "SVC-UMRAH-VISA", label: "تأشيرة عمرة فقط", basePrice: 795 },
  { code: "SVC-UMRAH-AIR", label: "عمرة بالخدمات بالطيران", basePrice: 3500 },
  { code: "SVC-UMRAH-SEA", label: "عمرة بالخدمات بالبحر", basePrice: 2650 },
]);
const TARGET = { pricingMode: "FIXED", currency: "SAR", priceUnit: "PER_TRAVELER", active: true };
const FIELDS = ["pricingMode", "basePrice", "currency", "priceUnit", "active"];
const REQUEST_CONTEXT = "nasaem-env-request:v1";
const ANSWER_CONTEXT = "nasaem-env-attest:v1";
const MAX_SKEW_MS = 2 * 60 * 1000;

const apply = process.argv.includes("--apply");
const base = String(process.env.NASAEM_API_BASE || "").replace(/\/+$/, "");
const email = process.env.NASAEM_ADMIN_EMAIL;
const password = process.env.NASAEM_ADMIN_PASSWORD;
const key = process.env.NASAEM_STAGING_ATTESTATION_KEY || "";

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(1);
}

let url;
try {
  url = new URL(base);
} catch {
  fail("NASAEM_API_BASE must be the API base URL, e.g. https://<staging-host>/api");
}
const host = url.hostname;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const ALLOWED_HOSTS = new Set(["adaptable-quietude-staging.up.railway.app", ...LOCAL_HOSTS]);
if (!ALLOWED_HOSTS.has(host)) fail(`${host} is not an allowed staging or local host`);
if (!LOCAL_HOSTS.has(host) && url.protocol !== "https:") fail("a non-local host must be reached over https");
if (!email || !password) fail("NASAEM_ADMIN_EMAIL and NASAEM_ADMIN_PASSWORD are required (an ADMIN account of staging)");
if (!/^(?:[0-9a-fA-F]{2}){32,}$/.test(key)) fail("NASAEM_STAGING_ATTESTATION_KEY is required (staging's ENVIRONMENT_ATTESTATION_KEY, hex)");

const hmac = (message) => crypto.createHmac("sha256", key).update(message).digest("hex");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

class CallError extends Error {
  constructor(method, path, status, code) {
    super(`${method} ${path} → ${status}${code ? ` ${code}` : ""}`);
    this.status = status;
  }
}

async function call(path, { method = "GET", token, body, signed = false } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let nonce = null;
  if (signed) {
    nonce = crypto.randomBytes(32).toString("hex");
    const timestamp = String(Date.now());
    const fullPath = `${url.pathname.replace(/\/+$/, "")}${path}`;
    headers["X-Nasaem-Env-Timestamp"] = timestamp;
    headers["X-Nasaem-Env-Nonce"] = nonce;
    headers["X-Nasaem-Env-Signature"] = hmac([REQUEST_CONTEXT, method, fullPath, timestamp, nonce, sha256(payload || "")].join("|"));
  }
  const res = await fetch(`${base}${path}`, { method, redirect: "error", headers, body: payload });
  const json = await res.json().catch(() => ({}));
  // Only a code of the expected shape is printed; never other server text.
  if (!res.ok) throw new CallError(method, path, res.status, typeof json.code === "string" && /^[A-Z_]{1,40}$/.test(json.code) ? json.code : "");
  return { json, nonce };
}

// The server's signed answer must be for THIS request's nonce, recent, say
// "staging" and carry a valid HMAC under the operator's copy of the key.
function verifyAnswer(answer, nonce) {
  if (!answer || typeof answer !== "object") return "no attestation in the answer";
  const { environment, issuedAt, signature } = answer;
  if (environment !== "staging") return "the server does not say it is staging";
  if (answer.nonce !== nonce) return "the attestation is for another request";
  if (!Number.isSafeInteger(issuedAt) || Math.abs(Date.now() - issuedAt) > MAX_SKEW_MS) return "the attestation is not recent";
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return "the attestation signature is malformed";
  const expected = Buffer.from(hmac([ANSWER_CONTEXT, environment, nonce, issuedAt].join("|")), "hex");
  const got = Buffer.from(signature, "hex");
  if (!crypto.timingSafeEqual(expected, got)) return "the attestation signature is wrong";
  return null;
}

const view = (s) => (s ? Object.fromEntries(FIELDS.map((f) => [f, f === "basePrice" ? Number(s[f]) : s[f]])) : null);
const matches = (s, approved) => s && s.pricingMode === TARGET.pricingMode && Number(s.basePrice) === approved.basePrice && s.currency === TARGET.currency && s.priceUnit === TARGET.priceUnit && s.active === true;

async function readUmrah(token) {
  const list = (await call("/services?limit=200", { token })).json.data || [];
  return Object.fromEntries(APPROVED.map((a) => [a.code, list.find((s) => s.code === a.code) || null]));
}

let token;
try {
  token = (await call("/auth/login", { method: "POST", body: { email, password } })).json.data?.token;
} catch (error) {
  fail(`login failed (${error.message})`);
}
if (!token) fail("login answered without a token");

// Proof of environment, before anything else is shown or changed.
let proofError;
try {
  const { json, nonce } = await call("/admin/staging/attest", { method: "POST", token, body: {}, signed: true });
  proofError = verifyAnswer(json.data, nonce);
} catch (error) {
  proofError = error.status === 404 ? "the server cannot prove it is staging (not staging, or a different key)" : `attestation failed (${error.message})`;
}
console.log(`target: ${host} — ${apply ? "APPLY" : "dry run (add --apply to change)"}`);
console.log(`environment: ${proofError ? `NOT VERIFIED — ${proofError}` : "staging (verified by the server's signature)"}`);
if (apply && proofError) fail("not applying: the target did not prove it is staging; nothing was changed");

let before;
try {
  before = await readUmrah(token);
} catch (error) {
  fail(`could not read the packages (${error.message})`);
}
for (const approved of APPROVED) {
  const row = before[approved.code];
  console.log(`${approved.code} ${approved.label}`);
  if (!row) {
    // Created by the staging route itself (same transaction as the prices).
    console.log("  before:  does not exist — will be created (setup), then priced");
    console.log(`  planned: ${JSON.stringify({ ...TARGET, basePrice: approved.basePrice })}`);
    continue;
  }
  console.log(`  before:  ${JSON.stringify(view(row))}`);
  console.log(`  planned: ${JSON.stringify({ ...TARGET, basePrice: approved.basePrice })}${matches(row, approved) ? "  (already set)" : ""}`);
  const features = Array.isArray(row.features) ? row.features : [];
  if (!features.some((f) => /^KIND:/.test(f))) console.log("  type: missing — the package type (KIND) will be added by the setup step");
  console.log(`  description (unchanged): ${features.filter((f) => /^(KIND|INCLUDED|EXCLUDED):/.test(f)).join(" | ") || "none"}`);
}

try {
  const rates = (await call("/flights/admin/rates", { token })).json.data || {};
  console.log(`SAR→SDG exchange rate: ${Number(rates.SAR) > 0 ? `active (${rates.SAR})` : "not active — the SDG price will not be shown"}`);
} catch (error) {
  console.log(`SAR→SDG exchange rate: not readable (${error.message})`);
}

if (!apply) process.exit(proofError ? 1 : 0);

// One signed request; staging applies all three in one transaction or none.
try {
  const { json, nonce } = await call("/admin/staging/umrah-pricing", { method: "POST", token, body: {}, signed: true });
  if (Array.isArray(json.data?.prepared) && json.data.prepared.length) console.log(`setup: ${json.data.prepared.join(", ")}`);
  const answerError = verifyAnswer(json.data?.attestation, nonce);
  if (answerError) {
    console.error(`the write was answered without a valid staging signature (${answerError}); checking what is stored`);
    process.exitCode = 1;
  }
} catch (error) {
  // Lost response or refusal: the read-back below says what is really stored.
  console.error(`apply: outcome unknown (${error.message}); checking what is stored`);
  process.exitCode = 1;
}

let after;
let published;
try {
  after = await readUmrah(token);
  published = (await call("/services/public/packages")).json.data || [];
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
if (!ok) {
  console.error("verification failed: check the rows above");
  process.exitCode = 1;
}
