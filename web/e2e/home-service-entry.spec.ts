import { expect, test } from "@playwright/test";

test.describe("Homepage — primary service entry", () => {
  test("shows only the two first-release services and a direct tracking action", async ({ page }) => {
    await page.goto("/");

    const entry = page.locator("#start-request");
    await expect(entry).toBeVisible();

    for (const label of ["العمرة", "الموافقة الأمنية"]) {
      await expect(entry.getByRole("tab", { name: label })).toBeVisible();
    }
    for (const label of ["التأشيرات", "الطيران", "البواخر", "الفنادق", "العروض"]) {
      await expect(entry.getByRole("tab", { name: label })).toHaveCount(0);
    }

    await expect(page.getByRole("link", { name: "تتبع طلبك" }).first()).toHaveAttribute("href", "/track");
  });

  test("shows concise first-view trust signals without marketing claims", async ({ page }) => {
    await page.goto("/");

    const trustSignals = page.getByTestId("homepage-trust-signals");
    await expect(trustSignals).toBeVisible();
    await expect(trustSignals.getByText("اختيار الخدمة بوضوح")).toBeVisible();
    await expect(trustSignals.getByText("المستندات داخل مسار الطلب")).toBeVisible();
    await expect(trustSignals.getByText("تتبع حالة الطلب")).toBeVisible();
  });

  test("Egypt security routes directly to its guest flow", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator("#start-request");

    await entry.getByRole("tab", { name: "الموافقة الأمنية" }).click();
    await expect(entry.getByRole("link", { name: /ابدأ الطلب/ })).toHaveAttribute("href", "/visas/egypt-security-approval");

    await expect(entry.getByText("يمكنك بدء الطلب كزائر دون إنشاء حساب.")).toBeVisible();
  });

  test("keeps existing-request tracking prominent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "تتبع طلبك" }).first()).toHaveAttribute("href", "/track");
  });

  test("shows API prices and requirements, and never guesses a missing fixed price", async ({ page }) => {
    await page.route("**/api/services/public", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          services: [],
          visaTypes: [{ id: "egypt-air", code: "VISA-EGYPT-CLEARANCE-AIR", name: "الموافقة الأمنية — جوي", category: "VISA", description: null, basePrice: "85", currency: "USD", priceSdg: "51000", pricingMode: "FIXED", priceUnit: "PER_REQUEST", iconKey: null, imageKey: null }],
        },
      }),
    }));
    await page.route("**/api/services/public/packages", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [{ id: "umrah-flight", code: "SVC-UMRAH-FLIGHT", name: "عمرة بالطيران", category: "UMRAH_PACKAGE", description: null, basePrice: "3500", currency: "SAR", priceSdg: null, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", iconKey: null, imageKey: null }] }) }));
    await page.route("**/api/services/umrah-flight/requirements/public", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: "passport", name: "صورة جواز السفر", required: true, type: "DOCUMENT" }] }),
    }));
    await page.route("**/api/visa-types/egypt-air/requirements/public", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [{ id: "passport-egypt", name: "صورة جواز السفر", required: true, type: "DOCUMENT" }] }) }));

    await page.goto("/");
    const entry = page.locator("#start-request");
    await expect(entry.getByText("3,500 SAR")).toBeVisible();
    await expect(entry.getByText("لكل مسافر")).toBeVisible();
    await expect(entry.getByTestId("homepage-required-documents").getByText("صورة جواز السفر")).toBeVisible();

    await entry.getByRole("tab", { name: "الموافقة الأمنية" }).click();
    await expect(entry.getByText("85 USD")).toBeVisible();
  });

  test("keeps one service-selection section and fits an Android viewport in RTL", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#start-request")).toHaveCount(1);
    await expect(page.getByText("كل ما تحتاجه لرحلتك في مكان واحد")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("redesigned hero: the agency logo, a services shortcut, and only first-release service cards", async ({ page }) => {
    await page.goto("/");
    const emblem = page.getByTestId("hero-emblem");
    await expect(emblem.getByRole("img", { name: "نسائم الحرمين للسفر والسياحة" })).toBeVisible();
    await expect(emblem.locator("img")).toHaveAttribute("src", /logo-dark\.png|site-assets\/logo-dark/);

    await page.getByRole("link", { name: "استعرض الخدمتين" }).click();
    await expect(page).toHaveURL(/#services$/);
    const cards = page.getByTestId("home-service-card");
    await expect(cards.first()).toBeVisible();

    // Every published card goes to one of the two first-release services.
    const hrefs = await cards.evaluateAll((els) => Object.fromEntries(els.map((el) => [el.getAttribute("data-service"), el.getAttribute("href")])));
    for (const [key, href] of Object.entries({ umrah: "/umrah", egypt: "/visas/egypt-security-approval" })) {
      if (hrefs[key] !== undefined) expect(hrefs[key]).toBe(href);
    }
    for (const key of ["visas", "flights", "ferries", "hotels", "packages"]) expect(hrefs[key]).toBeUndefined();
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
