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

  test("Umrah and Egypt forms: the floating WhatsApp button never covers the form on phones; it stays on desktop", async ({ page }) => {
    const floating = page.getByRole("link", { name: "تواصل معنا عبر واتساب" });
    for (const url of ["/umrah", "/visas/egypt-security-approval"]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url);
      await expect(floating).toBeHidden();
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(floating).toBeVisible();
    }
    // Other pages keep it on phones.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/track");
    await expect(floating).toBeVisible();
  });
});
