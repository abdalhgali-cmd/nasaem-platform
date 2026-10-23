import { expect, test } from "@playwright/test";

test.describe("Homepage — primary service entry", () => {
  test("redesigned hero: the agency logo, a services shortcut, and service cards only for published services", async ({ page, request }) => {
    await page.goto("/");
    const emblem = page.getByTestId("hero-emblem");
    await expect(emblem.getByRole("img", { name: "نسائم الحرمين للسفر والسياحة" })).toBeVisible();
    await expect(emblem.locator("img")).toHaveAttribute("src", /logo-dark\.png|site-assets\/logo-dark/);

    await page.getByRole("link", { name: "ابدأ طلبك", exact: true }).filter({ has: page.locator("svg") }).click();
    await expect(page).toHaveURL(/#services$/);
    await expect(page.locator("#start-request")).toHaveCount(1);
    await expect(page.getByRole("tab")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "تتبع طلبك", exact: true }).first()).toHaveAttribute("href", "/track");
    const cards = page.getByTestId("home-service-card");
    await expect(cards.first()).toBeVisible();

    // Every card goes to its own page, and only services the catalog publishes get one.
    const catalog = (await (await request.get("http://localhost:5000/api/services/public")).json()).data;
    const hasFlights = catalog.services.some((item: { category: string }) => item.category.toLowerCase().includes("flight"));
    const hrefs = await cards.evaluateAll((els) => Object.fromEntries(els.map((el) => [el.getAttribute("data-service"), el.getAttribute("href")])));
    if (hasFlights) expect(hrefs.flights).toBe("/flights");
    else expect(hrefs.flights).toBeUndefined();
    for (const [key, href] of Object.entries({ umrah: "/umrah", egypt: "/visas/egypt-security-approval", visas: "/visas", ferries: "/ferries", hotels: "/hotels", packages: "/packages" })) {
      if (hrefs[key] !== undefined) expect(hrefs[key]).toBe(href);
    }
    // No prices on the homepage cards (each page shows the agency's own).
    await expect(page.getByTestId("home-services")).not.toContainText(/SAR|USD|SDG/);
  });

  test("redesigned homepage fits an Android width and stops decorative motion for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.locator("#services").scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const ringAnimation = await page.getByTestId("hero-emblem").locator("div").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(ringAnimation).toBe("none");
  });
});
