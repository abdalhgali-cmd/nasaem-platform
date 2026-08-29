import type { BrowserContext, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const BACKEND_URL = "http://localhost:5000";
const BACKEND_DIR = path.resolve(__dirname, "../../backend");

// Reads the real, currently-valid /track OTP for a phone number directly
// from the database — the same thing a tester would do by checking the
// backend's logs/DB in place of a real WhatsApp message (WHATSAPP isn't
// configured with real credentials in this environment; see
// utils/whatsapp.js). Never invents or guesses a code. Requires the
// backend's own DATABASE_URL (its .env) to be reachable from here, which
// it is — same Postgres instance the running dev backend uses.
export function readTrackingLoginCode(phoneNormalized: string): string {
  const script = `
    import("./src/config/database.js").then(async ({ default: prisma }) => {
      const row = await prisma.contactRequestLoginCode.findFirst({
        where: { phone: ${JSON.stringify(phoneNormalized)}, consumedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (!row) { console.error("no unconsumed login code found"); process.exit(1); }
      process.stdout.write(row.code);
      await prisma.$disconnect();
    });
  `;
  const output = execFileSync("node", ["-e", script], { cwd: BACKEND_DIR, encoding: "utf8" });
  return output.trim();
}

// Logs in against the backend directly and reuses the resulting cookie in
// the browser context — frontend/web run on different ports but the same
// "site" (only the port differs), so a SameSite=Lax auth cookie set via one
// still gets sent on requests from the other. Never guesses a password:
// requires SEED_ADMIN_PASSWORD, the same env var backend/tests already
// require (see backend/README.md's Testing section) — fails loudly if
// unset rather than falling back to a guessed value.
//
// IMPORTANT: uses `page.request`, not the top-level `request` fixture.
// The top-level fixture is an unrelated APIRequestContext with its own
// cookie jar that is never shared with the browser context `page` lives
// in — logging in through it would silently leave `page` unauthenticated
// while every assertion still finds *something* to render (an error
// banner and an empty list look identical to "no results match the
// search"), so a broken login here would pass tests it shouldn't.
// page.request shares cookies with page's browser context by construction.
//
// Only the FIRST call in a given `playwright test` process actually hits
// POST /api/auth/login; every later call (any test, any spec file — the
// config runs workers: 1, so one process serves the whole run) reuses that
// real login's cookie instead of logging in again. auth.routes.js's own
// loginLimiter (10/15min, see Phase 17's review) exists specifically to
// slow down credential-stuffing — a growing e2e suite that logs in once
// per test would eventually trip it on nothing but its own legitimate
// runs, which isn't a limiter bug to route around so much as a sign the
// suite was making more real logins than it needed to.
let cachedAuthCookie: Parameters<BrowserContext["addCookies"]>[0][number] | null = null;

export async function loginAsSeededAdmin(page: Page) {
  if (cachedAuthCookie) {
    await page.context().addCookies([cachedAuthCookie]);
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("SEED_ADMIN_PASSWORD is not set — see backend/README.md's Testing section for how to seed a local database.");
  }

  const response = await page.request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: "admin@nasaem-platform.local", password },
  });
  if (!response.ok()) {
    throw new Error(`Login failed (${response.status()}): ${await response.text()}`);
  }

  const authCookie = (await page.context().cookies()).find((c) => c.name === "accessToken");
  if (authCookie) cachedAuthCookie = authCookie;
}

// Fails a mobile-viewport test the moment the page has to be scrolled
// sideways to see content — the single most common mobile regression
// (a wide table or fixed-width element breaking out of the viewport).
export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return overflow;
}
