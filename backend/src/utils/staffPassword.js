import crypto from "node:crypto";
import { z } from "zod";

// Policy for STAFF passwords (change / reset / generated): at least 10
// characters with a letter and a digit, at most 128.
export const staffPasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Password must contain a letter and a digit");

// A random one-time password for an admin-initiated reset (CSPRNG, 14 chars,
// unambiguous alphabet, always satisfies the policy).
export function generateTemporaryPassword() {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
