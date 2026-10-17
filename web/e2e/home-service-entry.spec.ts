import { expect, test } from "@playwright/test";

test.describe("Homepage — primary service entry", () => {
  test("shows the core services and a direct tracking action", async ({ page }) => {
    await page.goto("/");

    const entry = page.locator("#start-request");
    await expect(entry).toBeVisible();

    for (const label of ["العمرة", "الموافقة الأمنية", "التأشيرات", "الطيران", "البواخر", "الفنادق", "العروض"]) {
      await expect(entry.getByRole("tab", { name: label })).toBeVisible();
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

  test("visa and security entries route directly to their guest flows", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator("#start-request");

    await entry.getByRole("tab", { name: "الموافقة الأمنية" }).click();
    await expect(entry.getByRole("link", { name: /ابدأ الطلب/ })).toHaveAttribute("href", "/visas/egypt-security-approval");

    await entry.getByRole("tab", { name: "التأشيرات" }).click();
    await entry.getByRole("combobox").selectOption({ label: "الزيارة العائلية" });
    await expect(entry.getByRole("link", { name: /ابدأ الطلب/ })).toHaveAttribute("href", "/visas/saudi-family-visit");
    await expect(entry.getByText("يمكنك بدء الطلب كزائر دون إنشاء حساب.")).toBeVisible();
  });

  test("ferry entry routes customers into the ferry booking page", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator("#start-request");
    await entry.getByRole("tab", { name: "البواخر" }).click();

    await expect(entry.getByRole("link", { name: /ابدأ الطلب/ })).toHaveAttribute("href", "/ferries");
  });

  test("shows API prices and requirements, and never guesses a missing fixed price", async ({ page }) => {
    await page.route("**/api/services/public", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          services: [
            { id: "flight-fixed", code: "SVC-FLIGHT", name: "تذاكر الطيران", category: "flight", description: "رحلات من الكتالوج", basePrice: "1250", currency: "SAR", priceSdg: null, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", iconKey: null, imageKey: null },
            { id: "hotel-unpriced", code: "SVC-HOTEL", name: "حجز الفنادق", category: "hotel", description: null, basePrice: "0", currency: "SAR", priceSdg: null, pricingMode: "FIXED", priceUnit: "PER_REQUEST", iconKey: null, imageKey: null },
          ],
          visaTypes: [],
        },
      }),
    }));
    await page.route("**/api/services/public/packages", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) }));
    await page.route("**/api/services/flight-fixed/requirements/public", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [{ id: "passport", name: "صورة جواز السفر", required: true, type: "DOCUMENT" }] }),
    }));
    await page.route("**/api/services/hotel-unpriced/requirements/public", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) }));

    await page.goto("/");
    const entry = page.locator("#start-request");
    await entry.getByRole("tab", { name: "الطيران" }).click();
    await expect(entry.getByText("1,250 SAR")).toBeVisible();
    await expect(entry.getByText("لكل مسافر")).toBeVisible();
    await expect(entry.getByTestId("homepage-required-documents").getByText("صورة جواز السفر")).toBeVisible();

    await entry.getByRole("tab", { name: "الفنادق" }).click();
    await expect(entry.getByText("غير متاح للحجز").first()).toBeVisible();
    await expect(entry.getByRole("link", { name: /ابدأ الطلب/ })).toHaveCount(0);
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

  test("redesigned hero: the agency logo, a services shortcut, and service cards only for published services", async ({ page, request }) => {
    await page.goto("/");
    const emblem = page.getByTestId("hero-emblem");
    await expect(emblem.getByRole("img", { name: "نسائم الحرمين للسفر والسياحة" })).toBeVisible();
    await expect(emblem.locator("img")).toHaveAttribute("src", /logo-dark\.png|site-assets\/logo-dark/);

    await page.getByRole("link", { name: "استعرض الخدمات" }).click();
    await expect(page).toHaveURL(/#services$/);
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
