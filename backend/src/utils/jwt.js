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
