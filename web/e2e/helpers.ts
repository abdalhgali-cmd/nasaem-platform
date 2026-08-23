import type { Page } from "@playwright/test";

const BACKEND_URL = "http://localhost:5000";

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
export async function loginAsSeededAdmin(page: Page) {
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
}

// Fails a mobile-viewport test the moment the page has to be scrolled
// sideways to see content — the single most common mobile regression
// (a wide table or fixed-width element breaking out of the viewport).
export async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return overflow;
}
