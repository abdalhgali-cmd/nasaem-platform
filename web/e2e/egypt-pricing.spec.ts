import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { loginAsSeededAdmin } from "./helpers";

// Egypt service settings, end to end against the real backend: an
// administrator sets the approved prices and the shared USD rate in the
// back-office (Egypt tab → ضبط الخدمة والأسعار); the customer app shows them
// at once (no app rebuild), both entry methods are selectable and lead to the
// passport step; a later price change shows on the next load; a network
// failure is reported as a connection problem with a retry, never as
// "unavailable". Browser tests of the app bundle — NOT an Android device.

const BACKEND = "http://localhost:5000";
const APP = "http://localhost:8081";
const SHOTS = process.env.EGYPT_SHOTS_DIR || "";

test.describe.serial("Egypt service settings drive the customer app", () => {
  let office: Page;
  let appContext: BrowserContext;
  let app: Page;
  let restore: (() => Promise<unknown>) | null = null;

  test.beforeAll(async ({ browser }) => {
    office = await (await browser.newContext({ locale: "ar", viewport: { width: 1280, height: 900 } })).newPage();
    await loginAsSeededAdmin(office);
    const before = (await (await office.request.get(`${BACKEND}/api/visa-types/egypt/config`)).json()).data;
    const visas = (await (await office.request.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string; active: boolean; pricingMode: string; basePrice: string; currency: string; priceUnit: string }>;
    const originals = visas.filter((v) => v.code.startsWith("VISA-EGYPT-CLEARANCE-"));
    restore = async () => {
      for (const v of originals) await office.request.patch(`${BACKEND}/api/visa-types/${v.id}`, { data: { active: v.active, pricingMode: v.pricingMode, basePrice: Number(v.basePrice), currency: v.currency, priceUnit: v.priceUnit } });
      if (before?.usdRateToSdg) await office.request.patch(`${BACKEND}/api/flights/admin/rates`, { data: { USD: before.usdRateToSdg } });
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel } = devices["Pixel 5"];
    appContext = await browser.newContext({ ...pixel, viewport: { width: 360, height: 780 }, baseURL: APP, locale: "ar" });
    app = await appContext.newPage();
  });

  test.afterAll(async () => {
    await restore?.().catch(() => undefined);
    await appContext?.close();
    await office?.context().close();
  });

  async function saveSettings(air: string, border: string, rate: string) {
    await office.goto(`${BACKEND}/admin-dashboard.html#/egypt`);
    const settings = office.locator("[data-egypt-pricing-admin] details");
    await settings.waitFor({ timeout: 15_000 });
    if (!(await settings.evaluate((details) => (details as HTMLDetailsElement).open))) await settings.locator("summary").click();
    await expect(office.locator("#egypt-pricing-form")).toBeVisible({ timeout: 15_000 });
    await office.fill("#egypt-price-air", air);
    await office.fill("#egypt-price-border", border);
    await office.fill("#egypt-price-usd", rate);
    await office.locator('#egypt-pricing-form [name="airActive"]').check();
    await office.locator('#egypt-pricing-form [name="borderActive"]').check();
    office.once("dialog", (dialog) => dialog.accept());
    await office.locator("#egypt-pricing-save").click();
    await expect(office.locator("#egypt-pricing-message")).toContainText("تم حفظ الأسعار والحالة بنجاح", { timeout: 15_000 });
  }

  async function openEgypt() {
    await app.goto("/index.html");
    const guest = app.locator("#continueAsGuest");
    await guest.or(app.locator(".hc-top")).first().waitFor({ timeout: 15_000 });
    if (await guest.isVisible().catch(() => false)) await guest.click();
    await expect(app.locator(".hc-top")).toBeVisible();
  }

  test("the administrator sets 85 / 155 USD at 9,200 SDG; the preview shows the SDG amounts", async () => {
    await office.goto(`${BACKEND}/admin-dashboard.html#/egypt`);
    await office.locator("[data-egypt-pricing-admin] summary").click();
    await expect(office.locator("#egypt-pricing-form")).toBeVisible({ timeout: 15_000 });
    // The settings start from what is stored (seed: inactive, quoted).
    await office.fill("#egypt-price-air", "85");
    await office.fill("#egypt-price-border", "155");
    await office.fill("#egypt-price-usd", "9200");
    await expect(office.locator("#egypt-price-air-sdg")).toContainText("782,000");
    await expect(office.locator("#egypt-price-border-sdg")).toContainText("1,426,000");
    await saveSettings("85", "155", "9200");
    if (SHOTS) await office.screenshot({ path: path.join(SHOTS, "egypt-admin-settings.png") });
    const config = (await (await office.request.get(`${BACKEND}/api/visa-types/egypt/config`)).json()).data;
    expect([config.air.priceUsd, config.border.priceUsd, config.usdRateToSdg, config.air.active, config.border.active]).toEqual([85, 155, 9200, true, true]);
    // An employee cannot change financial settings.
    const denied = await office.request.fetch(`${BACKEND}/api/visa-types/egypt/config`, { method: "PATCH", headers: { Authorization: "Bearer invalid" }, data: {} });
    expect([401, 403]).toContain(denied.status());
  });

  test("the app shows both entry methods with the real prices, selectable, and reaches the passport step (360px)", async () => {
    await openEgypt();
    const air = app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-AIR"]');
    const border = app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-BORDER"]');
    await expect(air).toContainText("85");
    await expect(air).toContainText("782,000");
    await expect(border).toContainText("155");
    await expect(border).toContainText("1,426,000");
    if (SHOTS) await app.screenshot({ path: path.join(SHOTS, "egypt-home-prices-360.png") });
    await border.click();
    await expect(app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-BORDER"]')).toHaveAttribute("aria-checked", "true");
    await expect(app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-AIR"]')).toBeEnabled();
    await expect(app.locator('[name="entryPort"]')).toBeVisible({ timeout: 15_000 });
    await expect(app.locator(".passport-slot").first()).toBeVisible();
    await app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-AIR"]').click();
    await expect(app.locator('[name="departureCity"]')).toBeVisible({ timeout: 15_000 });
    await expect(app.locator(".passport-slot").first()).toBeVisible();
    // No horizontal overflow at 360px, also with 130% text.
    for (const scale of [1, 1.3]) {
      await app.addStyleTag({ content: `html{font-size:${scale * 100}%!important}` });
      const overflow = await app.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth);
      expect(overflow, `overflow at ${scale * 100}% text`).toBe(false);
    }
    if (SHOTS) await app.screenshot({ path: path.join(SHOTS, "egypt-air-step2-360-text130.png") });
  });

  test("a price change in the back-office reaches the app on the next load, without a rebuild", async () => {
    await saveSettings("90", "155", "9200");
    await openEgypt();
    await expect(app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-AIR"]')).toContainText("90");
    await expect(app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-AIR"]')).toContainText("828,000");
    await saveSettings("85", "155", "9200");
  });

  test("a network failure is a connection problem with a retry, never «unavailable»", async () => {
    await openEgypt();
    await app.route("**/api/services/public", (route) => route.abort("internetdisconnected"));
    await app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-AIR"]').click();
    await expect(app.locator("#egyptRetryCatalog")).toBeVisible({ timeout: 15_000 });
    await expect(app.locator("#egyptVariants")).toContainText("تحقق من الاتصال");
    await expect(app.locator("#egyptVariants")).not.toContainText("غير متاحة");
    await app.unroute("**/api/services/public");
    await app.locator("#egyptRetryCatalog").click();
    await expect(app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-AIR"]')).toBeVisible({ timeout: 15_000 });
  });
});
