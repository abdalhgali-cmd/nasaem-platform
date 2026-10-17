import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// The customer app (mobile/www) against the real backend and back-office:
// requests with several travelers, documents on the right traveler, staff
// review, price, payment accounts, receipt, rejection, acceptance.

const BACKEND = "http://localhost:5000";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
const localPhone = () => `09${unique().slice(-8)}`;
const normalized = (phone: string) => `249${phone.slice(1)}`;

async function skipOnboarding(page: Page) {
  await page.goto("/index.html");
  const skip = page.getByText("تخطي").first();
  await skip.waitFor({ timeout: 15_000 }).catch(() => undefined);
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.locator(".home-hero")).toBeVisible();
}

// Fills the "agency questions" of step 1 (whatever the back-office configured).
async function answerAgencyQuestions(page: Page) {
  const fields = page.locator("#answersSection [data-req]");
  const count = await fields.count();
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    const select = field.locator("select");
    if (await select.count()) {
      const options = await select.locator("option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value).filter(Boolean));
      if (options.length) await select.selectOption(options[0]);
      continue;
    }
    const input = field.locator("input");
    const type = (await input.getAttribute("type")) || "text";
    await input.fill(type === "date" ? "2030-01-15" : type === "number" ? "5" : "E2E-12345");
  }
}

async function fillData(page: Page, { name, phone, travelers }: { name: string; phone: string; travelers: string[] }) {
  await page.fill('[name="name"]', name);
  await page.fill('[name="phone"]', phone);
  // Umrah asks for the guarantor's phone (required).
  if (await page.locator('[name="guarantorPhone"]').count()) await page.fill('[name="guarantorPhone"]', "+966501234567");
  // Egypt land variant: the entry point (the air route has editable defaults).
  if (await page.locator('[name="entryPort"]').count()) await page.fill('[name="entryPort"]', "أرقين");
  await page.fill("#travelerCount", String(travelers.length));
  await page.dispatchEvent("#travelerCount", "change");
  for (const [index, traveler] of travelers.entries()) {
    await page.fill(`[name="t_name_${index}"]`, traveler);
    await page.fill(`[name="t_pass_${index}"]`, `P${unique()}${index}`);
  }
  await answerAgencyQuestions(page);
  await page.locator("#nextStepBtn").click();
}

async function uploadAllSlots(page: Page) {
  const keys = await page.locator("[data-slot-input]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slotInput || ""));
  for (const key of keys) await page.locator(`[data-slot-input="${key}"]`).setInputFiles(file(`doc-${key.slice(-6)}.png`));
  return keys;
}

async function submitFromReview(page: Page): Promise<string> {
  await page.locator("#nextStepBtn").click();
  const reference = page.locator("#requestReference");
  const payment = page.getByTestId("direct-payment-step");
  await reference.or(payment).first().waitFor({ timeout: 30_000 });
  if (await payment.isVisible()) await page.locator("#paymentLaterBtn").click();
  await expect(reference).toBeVisible({ timeout: 30_000 });
  return (await reference.innerText()).trim();
}

async function startFromShortcut(page: Page, key: string) {
  await page.locator(`.shortcut[data-key="${key}"]`).click();
  await page.locator("#startRequestBtn").click();
}

async function staff(page: Page): Promise<APIRequestContext> {
  await loginAsSeededAdmin(page);
  return page.request;
}

async function staffRequest(api: APIRequestContext, id: string) {
  const res = await api.get(`${BACKEND}/api/contact-requests/${id}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data;
}

// Opens "طلباتي" for a guest. A device that already verified this phone goes
// straight to the list; otherwise it asks for the phone and the WhatsApp code
// (read from the database, as a tester would read it from the delivery log).
async function openTracking(page: Page, phone: string) {
  await page.locator('#bottomNav [data-tab="requests"]').click();
  const form = page.locator("#trackPhoneForm");
  const list = page.locator(".request-row").first();
  await form.or(list).first().waitFor({ timeout: 15_000 });
  if (await form.isVisible()) {
    await page.fill('#trackPhoneForm [name="phone"]', phone);
    await page.locator("#sendCodeBtn").click();
    await page.waitForSelector('#trackCodeForm [name="code"]');
    await page.fill('#trackCodeForm [name="code"]', readTrackingLoginCode(normalized(phone)));
    await page.locator("#verifyCodeBtn").click();
  }
  await expect(list).toBeVisible({ timeout: 15_000 });
}

test.describe.serial("customer app: requests, documents, price and payment", () => {
  const family = { phone: localPhone(), id: "", travelers: ["عبدالله محمد", "فاطمة علي"] };

  test("home shows the start button, six shortcuts' worth of published services, and no placeholder text", async ({ page }) => {
    await skipOnboarding(page);
    await expect(page.getByRole("button", { name: "ابدأ طلبك الآن" })).toBeVisible();
    await expect(page.locator(".shortcut").first()).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/lorem|placeholder|undefined|NaN|\[object/i);
  });

  test("exchange rate: with no active SAR rate only the original price and an Arabic notice show; with one, the equivalent", async ({ page }) => {
    const api = await staff(page);
    const original = (await (await api.get(`${BACKEND}/api/flights/admin/rates`)).json()).data;
    try {
      expect((await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: 0 } })).status()).toBe(400);
      expect((await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: null } })).ok()).toBeTruthy();
      await skipOnboarding(page);
      await page.locator(".featured-row", { hasText: "SAR" }).first().click();
      await expect(page.locator(".info-fact").first()).toContainText("SAR");
      await expect(page.locator(".info-fact").first()).toContainText("غير متاح حاليًا");
      await expect(page.locator(".info-fact").first()).not.toContainText("SDG");

      expect((await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: 160 } })).ok()).toBeTruthy();
      await page.reload();
      await skipOnboarding(page);
      await page.locator(".featured-row", { hasText: "SAR" }).first().click();
      await expect(page.locator(".info-fact").first()).toContainText("SDG");
      await expect(page.locator(".info-fact").first()).not.toContainText("غير متاح");
    } finally {
      await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: original?.SAR ?? null } });
    }
  });

  test("back-office: an admin activates, deactivates and audits an exchange rate", async ({ page }) => {
    const api = await staff(page);
    const original = (await (await api.get(`${BACKEND}/api/flights/admin/rates`)).json()).data;
    page.on("dialog", (dialog) => void dialog.accept());
    try {
      await page.goto(`${BACKEND}/flight-management.html`);
      const row = page.locator("#fx-body tr", { hasText: "AED" });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.locator("input").fill("0");
      await row.getByRole("button").first().click();
      await expect(page.locator("#alert")).toContainText("أكبر من صفر");
      await row.locator("input").fill("117.5");
      await row.getByRole("button").first().click();
      await expect(page.locator("#fx-body tr", { hasText: "AED" })).toContainText("فعّال", { timeout: 15_000 });
      await page.locator("#fx-body tr", { hasText: "AED" }).locator("[data-fx-off]").click();
      await expect(page.locator("#fx-body tr", { hasText: "AED" })).toContainText("غير فعّال", { timeout: 15_000 });
      await expect(page.locator("#fx-history-body tr").first()).toContainText("AED: غير فعّال");
      await expect(page.locator("#fx-history-body")).toContainText("AED: 117.5");
    } finally {
      await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { AED: original?.AED ?? null } });
    }
  });

  test("family visit for two visitors: each visitor's passport goes to that visitor, and a missing document blocks sending", async ({ page }) => {
    await skipOnboarding(page);
    await startFromShortcut(page, "family");
    await fillData(page, { name: "عبدالله محمد", phone: family.phone, travelers: family.travelers });

    // step 2: nothing uploaded yet -> cannot continue, and it says exactly what is missing
    await expect(page.locator("[data-slot-input]").first()).toBeAttached();
    await page.locator("#nextStepBtn").click();
    await expect(page.locator("#stepErrors")).toContainText("المسافر 2");
    await expect(page.locator("#stepErrors")).toContainText("فاطمة علي");

    await uploadAllSlots(page);
    await page.locator("#nextStepBtn").click();
    await expect(page.getByText("راجع طلبك قبل الإرسال")).toBeVisible();
    family.id = await submitFromReview(page);
    expect(family.id.length).toBeGreaterThan(10);

    const api = await staff(page);
    const request = await staffRequest(api, family.id);
    expect(request.travelers).toHaveLength(2);
    for (const traveler of request.travelers) {
      const own = request.documents.filter((d: { travelerId: string | null }) => d.travelerId === traveler.id);
      expect(own.length, `documents of ${traveler.fullName}`).toBeGreaterThan(0);
      expect(own.every((d: { label: string }) => d.label.includes(traveler.fullName))).toBeTruthy();
    }
  });

  test("staff: opening the notification about a request goes to that exact request", async ({ page }) => {
    await staff(page);
    await page.goto(`${BACKEND}/admin-dashboard.html`);
    await page.locator("#notif-btn").click();
    const item = page.locator(`.notif-item[data-notif-href*="${family.id}"]`).first();
    await expect(item).toBeVisible({ timeout: 15_000 });
    await item.click();
    await expect(page).toHaveURL(new RegExp(`#/requests/${family.id}`), { timeout: 15_000 });
    await expect(page.locator("#cr-detail")).toContainText(family.travelers[0], { timeout: 15_000 });
  });

  test("registration signs the customer in straight away; the same number again goes to sign-in, prefilled", async ({ page }) => {
    const phone = localPhone();
    const name = `عميل تسجيل ${phone.slice(-5)}`;
    await skipOnboarding(page);
    await page.locator('#bottomNav [data-tab="account"]').click();
    await page.locator("#guestRegisterBtn").click();
    const form = page.locator("#registerForm");
    await form.locator('[name="fullName"]').fill(name);
    await form.locator('[name="phone"]').fill(phone);
    await form.locator('[name="password"]').fill("E2e@Pass12345");
    const consent = form.locator('input[type="checkbox"]');
    for (let i = 0; i < (await consent.count()); i += 1) await consent.nth(i).check();
    let registrations = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/customer-auth/register") && req.method() === "POST") registrations += 1;
    });
    await page.locator("#registerSubmit").dblclick();
    // Straight into the signed-in account screen, with the new customer's name.
    await expect(page.locator("h2", { hasText: name })).toBeVisible({ timeout: 15_000 });
    expect(registrations, "a double tap sends one registration").toBe(1);

    // App restarted: still signed in (the token was kept).
    await page.reload();
    await page.locator('#bottomNav [data-tab="account"]').click();
    await expect(page.locator("h2", { hasText: name })).toBeVisible({ timeout: 15_000 });

    // Signed out, then the same number registered again: no second account,
    // the sign-in screen opens with the number filled in.
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#logoutBtn").click();
    await expect(page.locator(".home-hero")).toBeVisible({ timeout: 15_000 });
    await page.locator('#bottomNav [data-tab="account"]').click();
    await page.locator("#guestRegisterBtn").click();
    await form.locator('[name="fullName"]').fill(name);
    await form.locator('[name="phone"]').fill(phone);
    await form.locator('[name="password"]').fill("E2e@Pass12345");
    for (let i = 0; i < (await consent.count()); i += 1) await consent.nth(i).check();
    await page.locator("#registerSubmit").click();
    await expect(page.locator("#loginNotice")).toContainText("لديه حساب بالفعل", { timeout: 15_000 });
    await expect(page.locator('#loginForm [name="identifier"]')).toHaveValue(phone);
  });

  test("customer with an account: the notification about a price opens that request", async ({ page }) => {
    const phone = localPhone();
    const password = "E2e@Pass12345";
    const register = await page.request.post(`${BACKEND}/api/customer-auth/register`, { data: { fullName: "عميل الإشعارات", phone, password } });
    expect(register.ok(), await register.text()).toBeTruthy();
    const { token } = (await register.json()).data;
    const created = await page.request.post(`${BACKEND}/api/contact-requests`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "عميل الإشعارات", phone, message: "طلب لاختبار الإشعار" },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.id;

    const api = await staff(page);
    const amount = 101 + Math.floor(Math.random() * 897);
    expect((await api.post(`${BACKEND}/api/contact-requests/${id}/invoice`, { data: { amount, currency: "SAR" } })).ok()).toBeTruthy();

    await skipOnboarding(page);
    await page.locator('#bottomNav [data-tab="account"]').click();
    await page.locator("#guestLoginBtn").click();
    await page.fill('#loginForm [name="identifier"]', phone);
    await page.fill('#loginForm [name="password"]', password);
    await page.locator("#loginSubmit").click();
    await page.locator(".account-menu-item", { hasText: "الإشعارات" }).click({ timeout: 15_000 });
    const row = page.locator(`.notification-row[data-request-id="${id}"]`).filter({ hasText: "عرض السعر" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.locator(".quote-amount")).toContainText(String(amount), { timeout: 15_000 });
  });

  test("Egypt, unconfigured catalog: both variants shown as unavailable, no form, no fallback to the original item", async ({ page }) => {
    await skipOnboarding(page);
    await page.locator('.shortcut[data-key="egypt"]').click();
    await expect(page.locator("#egyptVariantPrices")).toContainText("غير متاحة للحجز حاليًا");
    await page.locator("#startRequestBtn").click();
    const cards = page.locator(".variant-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("جوي — مطار القاهرة");
    await expect(cards.nth(1)).toContainText("بري — المعبر");
    for (const index of [0, 1]) {
      await expect(cards.nth(index)).toContainText("غير متاحة للحجز حاليًا");
      await expect(cards.nth(index)).toBeDisabled();
    }
    await expect(page.locator("#egyptUnavailable")).toBeVisible();
    await expect(page.locator('[name="name"]')).toHaveCount(0);
  });

  test("Egypt variants: entry method with its own configured price first, then traveler, documents, confirmed total; entry method stored", async ({ page }) => {
    test.setTimeout(180_000);
    const api = await staff(page);
    const list = (await (await api.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string }>;
    const idOf = (code: string) => list.find((v) => v.code === code)?.id as string;
    const airId = idOf("VISA-EGYPT-CLEARANCE-AIR");
    const borderId = idOf("VISA-EGYPT-CLEARANCE-BORDER");
    expect(airId && borderId, "variants are created by the seed (inactive, unpriced)").toBeTruthy();
    // Test fixture prices (the agency sets the real ones in the back-office).
    expect((await api.patch(`${BACKEND}/api/visa-types/${airId}`, { data: { pricingMode: "FIXED", basePrice: 120, currency: "USD", priceUnit: "PER_TRAVELER", active: true } })).ok()).toBeTruthy();
    expect((await api.patch(`${BACKEND}/api/visa-types/${borderId}`, { data: { pricingMode: "FIXED", basePrice: 45000, currency: "SDG", priceUnit: "PER_REQUEST", active: true } })).ok()).toBeTruthy();
    try {
      await skipOnboarding(page);
      await page.locator('.shortcut[data-key="egypt"]').click();
      const infoPrices = page.locator("#egyptVariantPrices");
      await expect(infoPrices).toContainText("120");
      await expect(infoPrices).toContainText("45");
      await expect(page.locator(".info-fact").first()).not.toContainText("50 ");
      await page.locator("#startRequestBtn").click();

      for (const [code, travelers, totalDigits, currency, mode] of [
        ["VISA-EGYPT-CLEARANCE-AIR", ["مسافر جوي"], "120", "USD", "AIR"],
        ["VISA-EGYPT-CLEARANCE-BORDER", ["مسافر بري", "مرافق بري"], "45", "SDG", "BORDER"],
      ] as const) {
        const cards = page.locator(".variant-card");
        await expect(cards).toHaveCount(2);
        await expect(cards.nth(0)).toContainText("جوي — مطار القاهرة");
        await expect(cards.nth(1)).toContainText("بري — المعبر");
        await page.locator(`.variant-card[data-code="${code}"]`).click();
        await expect(page.locator(`.variant-card[data-code="${code}"]`)).toHaveAttribute("aria-checked", "true");
        await expect(page.locator("#egyptFaqHelp")).not.toHaveAttribute("open", "");
        await fillData(page, { name: "عميل مصر", phone: localPhone(), travelers: [...travelers] });
        await uploadAllSlots(page);
        await page.locator("#nextStepBtn").click();
        await expect(page.locator("#fixedTotalAmount")).toContainText(totalDigits);
        await expect(page.locator("#fixedTotalAmount")).toContainText(currency);
        await page.locator("#confirmTotal").check();
        const reference = await submitFromReview(page);
        const stored = await staffRequest(api, reference);
        expect(stored.visaType.code).toBe(code);
        expect(stored.pricingMode).toBe("FIXED");
        expect(stored.invoice.status).toBe("APPROVED");
        expect(stored.invoice.currency).toBe(currency);
        expect(stored.intakeData.egyptEntryMode).toBe(mode);
        expect(stored.intakeData.egyptRoute).toEqual(mode === "AIR" ? { entryMode: "AIR", departureCity: "بورتسودان", arrivalAirport: "القاهرة" } : { entryMode: "BORDER", entryPort: "أرقين" });
        expect(stored.allowedActions).not.toContain("ISSUE_QUOTE");
        if (mode === "AIR") {
          await page.goto("/index.html");
          await page.locator('.shortcut[data-key="egypt"]').click();
          await page.locator("#startRequestBtn").click();
        }
      }
    } finally {
      await api.patch(`${BACKEND}/api/visa-types/${airId}`, { data: { pricingMode: "QUOTE", active: false } });
      await api.patch(`${BACKEND}/api/visa-types/${borderId}`, { data: { pricingMode: "QUOTE", active: false } });
    }
  });

  test("Umrah: choose a package, then each pilgrim's own documents", async ({ page }) => {
    await skipOnboarding(page);
    await startFromShortcut(page, "umrah");
    await page.locator(".package-card").first().click();
    await fillData(page, { name: "محمد أحمد", phone: localPhone(), travelers: ["محمد أحمد", "آمنة سعيد"] });
    await uploadAllSlots(page);
    await page.locator("#nextStepBtn").click();
    const reference = await submitFromReview(page);
    const api = await staff(page);
    const request = await staffRequest(api, reference);
    expect(request.travelers).toHaveLength(2);
    const byTraveler = new Set(request.documents.map((d: { travelerId: string | null }) => d.travelerId).filter(Boolean));
    expect(byTraveler.size).toBe(2);
  });

  test("staff review -> replaced document; price (frozen SDG) -> approval -> payment accounts -> receipt -> rejected with a reason -> accepted", async ({ page }) => {
    const api = await staff(page);
    const before = await staffRequest(api, family.id);
    const second = before.travelers.find((t: { fullName: string }) => t.fullName === family.travelers[1]);
    const doc = before.documents.find((d: { travelerId: string }) => d.travelerId === second.id);
    const rejected = await api.patch(`${BACKEND}/api/contact-requests/${family.id}/documents/${doc.id}/status`, { data: { status: "REJECTED", reviewNote: "الصورة غير واضحة" } });
    expect(rejected.ok()).toBeTruthy();

    await skipOnboarding(page);
    await openTracking(page, family.phone);
    await page.locator(".request-row").first().click();
    const row = page.locator(".check-row.check-rejected");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("الصورة غير واضحة");
    await expect(page.locator(".check-group", { hasText: family.travelers[1] })).toContainText("رفع بديل");
    await row.locator("input[type=file]").setInputFiles(file("replacement.png"));
    await expect(page.locator(".check-row.check-rejected")).toHaveCount(0, { timeout: 15_000 });

    const after = await staffRequest(api, family.id);
    const current = after.documents.filter((d: { travelerId: string; supersededAt: string | null }) => d.travelerId === second.id && !d.supersededAt);
    expect(current).toHaveLength(1);
    expect(current[0].fileName).toBe("replacement.png");

    // ---- the same verified session carries on: price -> approval -> payment
    // (a code is requested once per run: the tracking limiter allows 5 per 15 min)
    const originalRates = (await (await api.get(`${BACKEND}/api/flights/admin/rates`)).json()).data;
    await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: 160 } });
    const accountNumber = `E2E${unique()}`;
    const account = await api.post(`${BACKEND}/api/payment-accounts`, { data: { name: `E2E ${accountNumber}`, bankName: "E2E Bank", accountName: "Nasaem", accountNumber, currency: "SAR" } });
    expect(account.ok()).toBeTruthy();

    const price = await api.post(`${BACKEND}/api/contact-requests/${family.id}/invoice`, { data: { amount: 1000, currency: "SAR" } });
    expect(price.ok(), await price.text()).toBeTruthy();
    await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: 200 } });

    await page.reload();
    await openTracking(page, family.phone);
    await page.locator(".request-row").first().click();
    await expect(page.locator(".quote-amount")).toContainText("SAR");
    await expect(page.locator(".quote-sdg")).toContainText("160");
    await expect(page.locator(".quote-sdg")).toContainText("وقت إصدار السعر");
    await expect(page.locator("#paymentInfoBtn")).toHaveCount(0);

    await page.locator("#approveBtn").click();
    await expect(page.locator("#paymentInfoBtn")).toBeVisible({ timeout: 15_000 });
    await page.locator("#paymentInfoBtn").click();
    // One payment step: amount + currency, bank, holder, number with copy, and the receipt field together.
    const step = page.locator(".payment-step");
    await expect(step.locator(".payment-amount")).toContainText("1,000");
    await expect(step.locator(".payment-amount")).toContainText("SAR");
    const card = step.locator(".payment-card", { hasText: accountNumber });
    await expect(card).toContainText("E2E Bank");
    await expect(card).toContainText("صاحب الحساب: Nasaem");
    await expect(card.locator(`[data-copy="${accountNumber}"]`)).toBeVisible();
    await expect(step.locator('#receiptForm input[name="file"]')).toHaveAttribute("accept", "image/*,.pdf");

    await page.locator('#receiptForm input[name="file"]').setInputFiles(file("receipt.png"));
    await page.locator("#receiptForm button").click();
    await expect(page.locator(".pay-state")).toContainText("قيد المراجعة", { timeout: 15_000 });
    await expect(page.locator(".pay-state")).toContainText("لم يُعتمد");

    const paymentRejected = await api.post(`${BACKEND}/api/contact-requests/${family.id}/reject-payment`, { data: { reason: "المبلغ غير مطابق" } });
    expect(paymentRejected.ok()).toBeTruthy();
    await page.reload();
    await openTracking(page, family.phone);
    await page.locator(".request-row").first().click();
    await expect(page.locator(".pay-state-bad")).toContainText("المبلغ غير مطابق");

    await page.locator("#uploadReceiptBtn").click();
    await page.locator('#receiptForm input[name="file"]').setInputFiles(file("receipt2.png"));
    await page.locator("#receiptForm button").click();
    await expect(page.locator(".pay-state")).toContainText("قيد المراجعة", { timeout: 15_000 });

    const paymentConfirmed = await api.post(`${BACKEND}/api/contact-requests/${family.id}/confirm-payment`);
    expect(paymentConfirmed.ok()).toBeTruthy();
    await page.reload();
    await openTracking(page, family.phone);
    await page.locator(".request-row").first().click();
    await expect(page.locator(".pay-state-ok")).toContainText("تم قبول الدفع");
    await api.patch(`${BACKEND}/api/flights/admin/rates`, { data: { SAR: originalRates?.SAR ?? 0 } });
  });
});
