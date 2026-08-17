import jwt from "jsonwebtoken";
import ms from "ms";

export function signAccessToken(payload) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// Keeps the auth cookie's lifetime in sync with the JWT's own expiry instead
// of a separately hardcoded value, so the cookie never outlives (or expires
// before) the token it carries.
export function getAccessTokenMaxAgeMs() {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  const parsed = ms(expiresIn);

  return typeof parsed === "number" ? parsed : ms("7d");
}

export function verifyAccessToken(token) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.verify(token, process.env.JWT_SECRET);
}

// Public /track self-service login (see contact-request-tracking module) —
// deliberately its own token family (a "scope" claim, a separate cookie, a
// longer/fixed lifetime) rather than reusing signAccessToken/verifyAccessToken,
// so a leaked tracking token can never be mistaken for a staff session token
// or vice versa.
const TRACKING_TOKEN_EXPIRES_IN = "30d";

export function signTrackingToken(phoneNormalized) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign({ sub: phoneNormalized, scope: "tracking" }, process.env.JWT_SECRET, {
    expiresIn: TRACKING_TOKEN_EXPIRES_IN,
  });
}

export function verifyTrackingToken(token) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload = jwt.verify(token, process.env.JWT_SECRET);

  if (payload.scope !== "tracking") {
    throw new Error("Invalid token scope");
  }

  return payload;
}

export function getTrackingTokenMaxAgeMs() {
  return ms(TRACKING_TOKEN_EXPIRES_IN);
}
