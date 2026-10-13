import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Website Egypt security approval (موافقة حربي), real backend. Booking is per
// entry-method variant at the agency's fixed price: unconfigured variants are
// shown as «غير متاحة للحجز حاليًا» with no form; configured ones go
// variant + price → traveler + passport → confirm total once → submit (FIXED,
// no quote) → /track payment step (account details + receipt → under review).
// Prices below are test fixtures, restored to inactive/unpriced afterwards.

const BACKEND = "http://localhost:5000";
const PAGE_URL = "http://localhost:3000/visas/egypt-security-approval";
const PASSPORT_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const DOCUMENT_FIXTURE = path.join(__dirname, "fixtures", "sample-document.png");
const AIR = "VISA-EGYPT-CLEARANCE-AIR";
const BORDER = "VISA-EGYPT-CLEARANCE-BORDER";

async function variantIds(admin: APIRequestContext) {
  const list = (await (await admin.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string }>;
  const id = (code: string) => list.find((v) => v.code === code)?.id as string;
  return { air: id(AIR), border: id(BORDER) };
}

async function openFresh(page: Page) {
  await page.goto(PAGE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
}

test.describe.serial("Egypt Security Approval on the website", () => {
  test("unconfigured catalog: both variants listed as not bookable, no form, no fallback", async ({ page }) => {
    await openFresh(page);
    const cards = page.getByTestId("egypt-variant");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("موافقة حربي — دخول بالطيران");
    await expect(cards.nth(1)).toContainText("موافقة حربي — دخول عبر المعبر");
    for (const index of [0, 1]) {
      await expect(cards.nth(index)).toContainText("غير متاحة للحجز حاليًا");
      await expect(cards.nth(index)).toBeDisabled();
    }
    await expect(page.getByTestId("egypt-unavailable")).toBeVisible();
    await expect(page.getByText(/^ارفع صورة جواز السفر/)).toHaveCount(0);
  });

  test.describe("configured variants", () => {
    let admin: APIRequestContext;
    let ids: { air: string; border: string };
    let accountId = "";

    test.beforeAll(async ({ browser }) => {
      const adminPage = await (await browser.newContext()).newPage();
      await loginAsSeededAdmin(adminPage);
      admin = adminPage.request;
      ids = await variantIds(admin);
      expect(ids.air && ids.border, "variants are created by the seed").toBeTruthy();
      expect((await admin.patch(`${BACKEND}/api/visa-types/${ids.air}`, { data: { pricingMode: "FIXED", basePrice: 120, currency: "USD", priceUnit: "PER_TRAVELER", active: true } })).ok()).toBeTruthy();
      expect((await admin.patch(`${BACKEND}/api/visa-types/${ids.border}`, { data: { pricingMode: "FIXED", basePrice: 45000, currency: "SDG", priceUnit: "PER_REQUEST", active: true } })).ok()).toBeTruthy();
      const account = await admin.post(`${BACKEND}/api/payment-accounts`, { data: { name: "E2E Egypt USD", bankName: "بنك اختبار مصر", accountName: "حساب اختبار", accountNumber: `EG${Date.now()}`, currency: "USD" } });
      expect(account.ok(), await account.text()).toBeTruthy();
      accountId = (await account.json()).data.id;
    });

    test.afterAll(async () => {
      if (!admin) return;
      await admin.patch(`${BACKEND}/api/visa-types/${ids.air}`, { data: { pricingMode: "QUOTE", active: false } });
      await admin.patch(`${BACKEND}/api/visa-types/${ids.border}`, { data: { pricingMode: "QUOTE", active: false } });
      if (accountId) await admin.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } });
    });

    test("each variant shows its own configured price; the form appears only after choosing", async ({ page }) => {
      await openFresh(page);
      await expect(page.locator(`[data-code="${AIR}"]`).getByTestId("egypt-variant-price")).toHaveText("120 USD للمسافر");
      await expect(page.locator(`[data-code="${BORDER}"]`).getByTestId("egypt-variant-price")).toHaveText("45,000 SDG للطلب");
      await expect(page.getByText(/^ارفع صورة جواز السفر/)).toHaveCount(0);
      await page.locator(`[data-code="${AIR}"]`).click();
      await expect(page.getByText(/^ارفع صورة جواز السفر/)).toBeVisible();
      await expect(page.getByText("اختر صورة الجواز", { exact: true })).toBeVisible();
    });

    test("passport upload creates the draft on demand; a disallowed file is refused before upload", async ({ page }) => {
      test.setTimeout(90_000);
      await openFresh(page);
      await page.locator(`[data-code="${AIR}"]`).click();
      await page.locator('input[type="file"]').setInputFiles({ name: "passport.txt", mimeType: "text/plain", buffer: Buffer.from("not a passport image") });
      await expect(page.getByText("نوع الملف غير مدعوم. ارفع صورة JPG/PNG أو ملف PDF.")).toBeVisible();
      const draftRequests: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST" && /\/api\/intake-drafts(?:\?|$)/.test(request.url())) draftRequests.push(request.url());
      });
      await page.locator('input[type="file"]').setInputFiles(PASSPORT_FIXTURE);
      await expect(page.getByText("تم رفع الجواز بنجاح", { exact: true })).toBeVisible({ timeout: 60_000 });
      expect(draftRequests).toHaveLength(1);
    });

    for (const [code, total, currency, mode] of [
      [AIR, "120 USD", "USD", "AIR"],
      [BORDER, "45,000 SDG", "SDG", "BORDER"],
    ] as const) {
      test(`${mode}: traveler + passport → confirm total once → FIXED request, no quote${mode === "AIR" ? " → /track payment step" : ""}`, async ({ page }) => {
        test.setTimeout(120_000);
        const stamp = `${Date.now()}`.slice(-8);
        const phone = `2499${stamp}`;
        const name = `عميل مصر ${mode} ${stamp}`;
        await openFresh(page);
        await page.locator(`[data-code="${code}"]`).click();
        await page.getByPlaceholder("الاسم كما في الجواز").fill(name);
        await page.getByPlaceholder("+249...").fill(`+${phone}`);
        await page.getByPlaceholder("رقم الجواز").fill(`P${stamp}`);
        await page.locator('input[type="date"]').fill("1990-05-01");
        await page.locator('input[type="file"]').setInputFiles(DOCUMENT_FIXTURE);
        await expect(page.getByText("تم رفع الجواز بنجاح", { exact: true })).toBeVisible({ timeout: 60_000 });

        await expect(page.getByTestId("egypt-total-amount")).toHaveText(total);
        // A review of what will be sent, editable until sending.
        await expect(page.getByTestId("egypt-review")).toContainText(name);
        await expect(page.getByTestId("egypt-review")).toContainText(`P${stamp}`);
        await expect(page.getByTestId("egypt-review")).toContainText(mode === "AIR" ? "دخول بالطيران" : "دخول عبر المعبر");
        const send = page.getByRole("button", { name: "إرسال طلب الموافقة" });
        await expect(send).toBeDisabled();
        await page.getByTestId("egypt-confirm-total").check();
        const submitted = page.waitForResponse((r) => /\/intake-drafts\/[^/]+\/submit$/.test(r.url()));
        await send.click();
        expect((await submitted).status()).toBe(201);
        // Straight to the payment step with the accepted total.
        const directStep = page.getByTestId("payment-step");
        await expect(directStep.getByTestId("payment-amount")).toHaveText(total, { timeout: 15_000 });
        if (mode === "AIR") {
          // AIR pays later through /track (below).
          await directStep.getByRole("button", { name: /سأحوّل لاحقًا/ }).click();
        } else {
          await directStep.getByTestId("payment-receipt-input").setInputFiles(DOCUMENT_FIXTURE);
          await directStep.getByRole("button", { name: "إرسال الطلب للمراجعة" }).click();
          await expect(page.getByTestId("payment-status")).toHaveText("بانتظار مراجعة التحويل", { timeout: 15_000 });
        }
        await expect(page.getByText("تم استلام طلب الموافقة الأمنية")).toBeVisible();
        await expect(page.getByTestId("egypt-next-step")).toContainText("لن يصلك عرض سعر آخر");

        const list = (await (await admin.get(`${BACKEND}/api/contact-requests?limit=20&search=${encodeURIComponent(name)}`)).json()).data as Array<{ id: string }>;
        expect(list).toHaveLength(1);
        const stored = (await (await admin.get(`${BACKEND}/api/contact-requests/${list[0].id}`)).json()).data;
        expect(stored.visaType.code).toBe(code);
        expect(stored.pricingMode).toBe("FIXED");
        expect(stored.invoice.status).toBe("APPROVED");
        expect(stored.invoice.currency).toBe(currency);
        expect(stored.intakeData.egyptEntryMode).toBe(mode);
        expect(stored.allowedActions).not.toContain("ISSUE_QUOTE");
        expect(stored.paymentStatus).toBe(mode === "AIR" ? "AWAITING_TRANSFER" : "UNDER_REVIEW");

        if (mode === "AIR") {
          await page.goto("/track");
          await page.locator("#phone").fill(`+${phone}`);
          await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
          await page.locator("#code").fill(readTrackingLoginCode(phone));
          await page.getByRole("button", { name: "تأكيد" }).click();
          await expect(page.getByRole("button", { name: "موافقة على السعر" })).toHaveCount(0);
          const step = page.getByTestId("payment-step");
          await expect(step.getByTestId("payment-amount")).toHaveText("120 USD", { timeout: 15_000 });
          await expect(step.getByTestId("payment-account").first()).toContainText("رقم الحساب");
          await expect(step.getByRole("button", { name: "نسخ رقم الحساب" }).first()).toBeVisible();
          await step.locator('input[type="file"]').setInputFiles(DOCUMENT_FIXTURE);
          await step.getByRole("button", { name: "رفع الإيصال للمراجعة" }).click();
          await expect(page.getByTestId("payment-under-review")).toContainText("قيد المراجعة", { timeout: 15_000 });
          const after = (await (await admin.get(`${BACKEND}/api/contact-requests/${list[0].id}`)).json()).data;
          expect(after.paymentStatus).toBe("UNDER_REVIEW");
        }
      });
    }

    test("a price changed after it was shown is refused (409) and re-confirmed at the new total", async ({ page }) => {
      test.setTimeout(120_000);
      const stamp = `${Date.now()}`.slice(-8);
      await openFresh(page);
      await page.locator(`[data-code="${BORDER}"]`).click();
      await page.getByPlaceholder("الاسم كما في الجواز").fill(`عميل تغيير السعر ${stamp}`);
      await page.getByPlaceholder("+249...").fill(`+2499${stamp}`);
      await page.getByPlaceholder("رقم الجواز").fill(`R${stamp}`);
      await page.locator('input[type="date"]').fill("1988-03-03");
      await page.locator('input[type="file"]').setInputFiles(DOCUMENT_FIXTURE);
      await expect(page.getByText("تم رفع الجواز بنجاح", { exact: true })).toBeVisible({ timeout: 60_000 });
      await page.getByTestId("egypt-confirm-total").check();
      expect((await admin.patch(`${BACKEND}/api/visa-types/${ids.border}`, { data: { basePrice: 50000 } })).ok()).toBeTruthy();
      try {
        const refused = page.waitForResponse((r) => /\/intake-drafts\/[^/]+\/submit$/.test(r.url()));
        await page.getByRole("button", { name: "إرسال طلب الموافقة" }).click();
        expect((await refused).status()).toBe(409);
        await expect(page.getByTestId("egypt-total-amount")).toHaveText("50,000 SDG");
        await expect(page.getByTestId("egypt-confirm-total")).not.toBeChecked();
        await page.getByTestId("egypt-confirm-total").check();
        const accepted = page.waitForResponse((r) => /\/intake-drafts\/[^/]+\/submit$/.test(r.url()));
        await page.getByRole("button", { name: "إرسال طلب الموافقة" }).click();
        expect((await accepted).status()).toBe(201);
      } finally {
        await admin.patch(`${BACKEND}/api/visa-types/${ids.border}`, { data: { basePrice: 45000 } });
      }
    });
  });
});
