import { expect, test } from "@playwright/test";

const hydrationErrorPattern = /(hydration failed|hydration|Minified React error #418|server rendered HTML|didn't match the client)/i;

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`homepage hydrates without React mismatch when reduced motion is ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });

    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && hydrationErrorPattern.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      if (hydrationErrorPattern.test(error.message)) {
        hydrationErrors.push(error.message);
      }
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Give post-hydration effects/media-query subscriptions a chance to run;
    // a mismatch caused by prefers-reduced-motion used to surface during this
    // initial hydration window.
    await page.waitForTimeout(500);

    expect(hydrationErrors, `unexpected hydration errors: ${hydrationErrors.join("\n")}`).toEqual([]);
  });
}
