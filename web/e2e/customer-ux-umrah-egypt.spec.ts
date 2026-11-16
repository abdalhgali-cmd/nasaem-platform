import { test, expect } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// Phase 5 UX fixes on the customer website (Umrah and Egypt only), real backend.
// Prices are test fixtures, restored to inactive/unpriced afterwards.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const AIR = "VISA-EGYPT-CLEARANCE-AIR";

test.describe.serial("customer UX — Umrah and Egypt", () => {
  test("Egypt: the disabled «إرسال» says what is still missing, and the hint follows the form", async ({ browser, page }) => {
    const office = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(office);
    const visas = (await (await office.request.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string }>;
    const air = visas.find((v) => v.code === AIR)!;
    const priced = await office.request.patch(`${BACKEND}/api/visa-types/${air.id}`, { headers: { Origin: WEB }, data: { pricingMode: "FIXED", basePrice: 95, currency: "USD", priceUnit: "PER_TRAVELER", active: true } });
    expect(priced.ok(), await priced.text()).toBeTruthy();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/visas/egypt-security-approval");
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.locator(`[data-code="${AIR}"]`).click();
      const hint = page.getByTestId("egypt-submit-hint");
      await expect(hint).toHaveText("قبل الإرسال: الاسم الكامل مطلوب");
      await expect(page.getByRole("button", { name: "إرسال طلب الموافقة" })).toBeDisabled();
      await page.getByPlaceholder("الاسم كما في الجواز").fill("مسافر تجربة الواجهة");
      await expect(hint).toHaveText("قبل الإرسال: رقم الهاتف مطلوب");
    } finally {
      await office.request.patch(`${BACKEND}/api/visa-types/${air.id}`, { headers: { Origin: WEB }, data: { pricingMode: "QUOTE", active: false } });
      await office.context().close();
    }
  });

  test("Umrah: a «يبدأ من» price reads right-to-left with only the amount isolated", async ({ browser, page }) => {
    const office = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(office);
    const stamp = `${Date.now()}`.slice(-8);
    const name = `باقة عمرة بسعر يبدأ من ${stamp}`;
    const created = await office.request.post(`${BACKEND}/api/services`, { headers: { Origin: WEB }, data: { code: `E2E-UMRAH-FROM-${stamp}`, name, category: "UMRAH_PACKAGE", basePrice: 1200, currency: "SAR", active: true, pricingMode: "QUOTE", features: ["KIND: VISA_ONLY"] } });
    expect(created.ok(), await created.text()).toBeTruthy();
    const id = (await created.json()).data.id as string;
    try {
      await page.goto("/umrah");
      const card = page.locator("button").filter({ hasText: name });
      await expect(card).toBeVisible({ timeout: 15_000 });
      const starting = card.locator("span", { hasText: /^يبدأ من/ });
      await expect(starting).not.toHaveAttribute("dir", "ltr");
      await expect(starting.locator('span[dir="ltr"]')).toHaveText("1,200 SAR");
    } finally {
      await office.request.patch(`${BACKEND}/api/services/${id}`, { headers: { Origin: WEB }, data: { active: false } });
      await office.context().close();
    }
  });

  test("Umrah: a failing catalog shows an error with a retry hint, never an endless spinner", async ({ page }) => {
    await page.route("**/api/services/public/packages", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await page.goto("/umrah");
    await expect(page.getByText("تعذّر تحميل قائمة الخدمات، حاول تحديث الصفحة")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".animate-spin")).toHaveCount(0);
  });

  test("Umrah: «إعادة المحاولة» reloads the catalog after a failure; the step is named and counted", async ({ page }) => {
    let fail = true;
    await page.route("**/api/services/public/packages", (route) => fail ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.continue());
    await page.goto("/umrah");
    const error = page.getByTestId("catalog-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    fail = false;
    await error.getByRole("button", { name: "إعادة المحاولة" }).click();
    await expect(error).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "اختر الباقة", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("wizard-step-label")).toHaveText(/الخطوة 1 من \d+: اختيار الباقة/);
  });

  test("Umrah: the page does not jump while the packages load (CLS ≤ 0.1, slow catalog)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.route("**/api/services/public/packages", async (route) => { await new Promise((done) => setTimeout(done, 1200)); await route.continue(); });
    await page.goto("/umrah");
    await expect(page.getByTestId("wizard-skeleton")).toBeVisible();
    await expect(page.getByRole("heading", { name: "اختر الباقة", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThanOrEqual(0.1);
  });

  test("Umrah and Egypt forms: the floating WhatsApp button never covers the form on phones; it stays on desktop", async ({ page }) => {
    const floating = page.getByRole("link", { name: "تواصل معنا عبر واتساب" });
    for (const url of ["/umrah", "/visas/egypt-security-approval", "/track", "/contact"]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url);
      await expect(floating).toBeHidden();
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(floating).toBeVisible();
    }
    // Other pages keep it on phones.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(floating).toBeVisible();
  });
});
test("keyboard skip link moves focus into the main content", async ({ page }) => {
  for (const path of ["/umrah", "/track"]) {
    await page.goto(path);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "تخطَّ إلى المحتوى الرئيسي" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  }
});

test("dark primary actions keep readable text contrast", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "تفعيل الوضع الداكن" }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const action = page.locator(".bg-button").first();
  await expect(action).toBeVisible();
  const ratio = await action.evaluate(async (el) => {
    getComputedStyle(el).getPropertyValue("color");
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {})));
    const style = getComputedStyle(el);
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((c) => {
        const value = c / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});
