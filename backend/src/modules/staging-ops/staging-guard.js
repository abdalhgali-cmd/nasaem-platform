import crypto from "node:crypto";

// Server-side proof that THIS server is the staging environment, for
// operator actions that must never reach production (owner decision
// 2026-10-28, option C). A hostname, even localhost, proves nothing: a local
// port can be forwarded to production, and a proxy can send one request to
// staging and the next to production. So the check is made by the server
// that performs the write, on every write, not only in a preflight.
//
// A server is staging only when BOTH are set (Railway variables, never in
// the repository):
//   DEPLOYMENT_ENVIRONMENT = "staging"   (exactly; any other value is not)
//   ENVIRONMENT_ATTESTATION_KEY          (>= 32 random bytes as hex, staging only)
// Production has neither (or not this key), so it cannot verify a request or
// sign an answer, and every staging-only route answers 404 there.
//
// The operator's script holds the same key and signs each request:
//   X-Nasaem-Env-Timestamp  milliseconds since epoch (within ±2 minutes)
//   X-Nasaem-Env-Nonce      64 hex characters, never accepted twice
//   X-Nasaem-Env-Signature  hex HMAC-SHA256(key, REQUEST_CONTEXT|method|path|timestamp|nonce|sha256(body))
// and checks the server's signed answer (ANSWER_CONTEXT), so a server without
// the key can neither accept the write nor pretend to be staging.
// Remaining assumption (documented, not checkable here): staging's
// DATABASE_URL points at the staging database only.

export const REQUEST_CONTEXT = "nasaem-env-request:v1";
export const ANSWER_CONTEXT = "nasaem-env-attest:v1";
const MAX_SKEW_MS = 2 * 60 * 1000;
// At least 32 random bytes, written as hex (e.g. `openssl rand -hex 32`).
const KEY_PATTERN = /^(?:[0-9a-fA-F]{2}){32,}$/;
const NONCE_PATTERN = /^[0-9a-f]{64}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

// Nonces seen in the last few minutes, in this process (staging runs one
// instance). The window outlives the accepted clock skew. A replay after a
// restart could only repeat the same staging-only action on staging (the
// approved prices, idempotent); it can never reach production, which has no
// key.
const seenNonces = new Map();

function stagingKey() {
  if (process.env.DEPLOYMENT_ENVIRONMENT !== "staging") return null;
  const key = process.env.ENVIRONMENT_ATTESTATION_KEY || "";
  return KEY_PATTERN.test(key) ? key : null;
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hmacHex(key, message) {
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

export function requestMessage({ method, path, timestamp, nonce, body }) {
  return [REQUEST_CONTEXT, method.toUpperCase(), path, timestamp, nonce, sha256Hex(body || "")].join("|");
}

export function answerMessage({ environment, nonce, issuedAt }) {
  return [ANSWER_CONTEXT, environment, nonce, issuedAt].join("|");
}

function equalHex(a, b) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function rememberNonce(nonce, now) {
  for (const [seen, at] of seenNonces) if (now - at > 2 * MAX_SKEW_MS) seenNonces.delete(seen);
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now);
  return true;
}

// The same answer for "not staging" and "wrong proof": nothing about this
// server's configuration is revealed to a caller who cannot prove the key.
function notFound(res) {
  return res.status(404).json({ success: false, message: "Not found" });
}

// First gate, before rate limiting: a server not configured as staging
// answers every staging-only route with the same 404 (no 429, no hint).
export function requireStagingServer(req, res, next) {
  return stagingKey() ? next() : notFound(res);
}

// Route guard. The raw body is used for the signature, so a body changed in
// transit fails. Bearer only: a browser cookie session can never drive it.
export function requireStagingProof(req, res, next) {
  const key = stagingKey();
  if (!key) return notFound(res);
  if (!req.headers.authorization?.startsWith("Bearer ")) return notFound(res);
  // Nothing outside the signature: no query string, and a body only when
  // its exact bytes were captured for the check.
  if (req.originalUrl.includes("?")) return notFound(res);
  const hasBody = Number(req.get("content-length") || 0) > 0 || req.get("transfer-encoding") !== undefined;
  if (hasBody && !Buffer.isBuffer(req.rawBody)) return notFound(res);

  const timestamp = String(req.get("x-nasaem-env-timestamp") || "");
  const nonce = String(req.get("x-nasaem-env-nonce") || "");
  const signature = String(req.get("x-nasaem-env-signature") || "").toLowerCase();
  const now = Date.now();
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > MAX_SKEW_MS) return notFound(res);
  if (!NONCE_PATTERN.test(nonce) || !SIGNATURE_PATTERN.test(signature)) return notFound(res);

  const expected = hmacHex(key, requestMessage({ method: req.method, path: req.originalUrl, timestamp, nonce, body: req.rawBody }));
  if (!equalHex(expected, signature)) return notFound(res);
  if (!rememberNonce(nonce, now)) return notFound(res);

  req.stagingProof = { key, nonce };
  return next();
}

// The server's signed statement that it is staging, bound to the caller's
// nonce, for the script to verify with its own copy of the key.
export function signStagingAnswer(req) {
  const issuedAt = Date.now();
  const environment = "staging";
  const signature = hmacHex(req.stagingProof.key, answerMessage({ environment, nonce: req.stagingProof.nonce, issuedAt }));
  return { environment, nonce: req.stagingProof.nonce, issuedAt, signature };
}

// Test hook: forget seen nonces between independent test cases.
export function resetSeenNonces() {
  seenNonces.clear();
}
