import { devices, expect, request as playwrightRequest, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Egypt security approval, end to end in the browser against the real
// backend: the customer app (mobile/www) and the staff back-office
// (backend/public). Three steps (entry method → details and passports →
// payment), passport camera/upload with on-device hints, the optional
// flight booking, staff payment confirmation (paid receipt), approval
// issuance, travel preparation, ticket, circular — and an overland request
// with no travel date yet. Prices and accounts are test fixtures.
// These are browser tests of the app's web bundle, NOT an Android device.

const BACKEND = "http://localhost:5000";
const APP = "http://localhost:8081";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
// A synthetic passport-style test image shipped with the backend tests (no real person).
const SAMPLE_PASSPORT = fs.readFileSync(path.resolve(__dirname, "../../backend/tests/fixtures/passport-mrz-sample.png"));
const SHOTS = process.env.EGYPT_SHOTS_DIR || "";
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);

test.describe.serial("Egypt security approval: customer app and back-office", () => {
  const phone = `09${unique().slice(-8)}`;
  let appContext: BrowserContext;
  let app: Page;
  let office: Page;
  const restore: Array<() => Promise<unknown>> = [];

  const shot = async (page: Page, name: string) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  };

  test.beforeAll(async ({ browser }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel } = devices["Pixel 5"];
    appContext = await browser.newContext({ ...pixel, viewport: { width: 390, height: 844 }, baseURL: APP, locale: "ar" });
    app = await appContext.newPage();
    office = await (await browser.newContext({ locale: "ar", viewport: { width: 1280, height: 900 } })).newPage();
    await loginAsSeededAdmin(office);
    const visas = (await (await office.request.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string }>;
    for (const [code, price] of [["VISA-EGYPT-CLEARANCE-AIR", 95], ["VISA-EGYPT-CLEARANCE-BORDER", 80]] as const) {
      const visa = visas.find((v) => v.code === code);
      expect(visa, code).toBeTruthy();
      const res = await office.request.patch(`${BACKEND}/api/visa-types/${visa!.id}`, { data: { pricingMode: "FIXED", basePrice: price, currency: "USD", priceUnit: "PER_TRAVELER", active: true } });
      expect(res.ok(), await res.text()).toBeTruthy();
      restore.push(() => office.request.patch(`${BACKEND}/api/visa-types/${visa!.id}`, { data: { pricingMode: "QUOTE", active: false } }));
    }
    const account = await office.request.post(`${BACKEND}/api/payment-accounts`, {
      data: { name: "E2E Egypt USD", bankName: "بنك اختبار", accountName: "نسائم الحرمين", accountNumber: `EG${unique()}`, currency: "USD" },
    });
    expect(account.ok(), await account.text()).toBeTruthy();
    const accountId = (await account.json()).data.id;
    restore.push(() => office.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } }));
  });

  test.afterAll(async () => {
    for (const undo of restore) await undo().catch(() => undefined);
    await appContext?.close();
    await office?.context().close();
  });

  async function home() {
    await app.goto("/index.html");
    const guest = app.locator("#continueAsGuest");
    await guest.or(app.locator(".hc-top")).first().waitFor({ timeout: 15_000 });
    if (await guest.isVisible().catch(() => false)) await guest.click();
    await expect(app.locator(".hc-top")).toBeVisible();
  }

  async function openTracked(id: string) {
    await home();
    await app.locator('#bottomNav [data-tab="requests"]').click();
    const form = app.locator("#trackPhoneForm");
    await form.or(app.locator(".request-row").first()).first().waitFor({ timeout: 15_000 });
    if (await form.isVisible()) {
      await app.fill('#trackPhoneForm [name="phone"]', phone);
      await app.locator("#sendCodeBtn").click();
      await app.waitForSelector('#trackCodeForm [name="code"]');
      await app.fill('#trackCodeForm [name="code"]', readTrackingLoginCode(`249${phone.slice(1)}`));
      await app.locator("#verifyCodeBtn").click();
    }
    await app.locator(`.request-row[data-id="${id}"]`).click({ timeout: 15_000 });
    await expect(app.locator("#requestJourney")).toBeVisible({ timeout: 15_000 });
  }

  async function openWorkspace(id: string) {
    await office.goto(`${BACKEND}/admin-dashboard.html#/requests/${id}`);
    await expect(office.locator("#egypt-workspace")).toBeVisible({ timeout: 20_000 });
  }

  async function staffAct(locator: ReturnType<Page["locator"]>, success: string) {
    await locator.click();
    await expect(office.locator("#cr-action-alert")).toContainText(success, { timeout: 20_000 });
  }

  let airRequestId = "";

  test("air: three steps, passport camera + hint + replace, flight request, invoice email, payment", async () => {
    test.setTimeout(180_000);
    await home();
    // Step 1: entry method with its fixed USD price (and SDG when a rate exists).
    await app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-AIR"]').click();
    await expect(app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-AIR"]')).toHaveAttribute("aria-checked", "true");
    await expect(app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-AIR"] .variant-price')).toContainText("95");
    await expect(app.locator(".egypt-step-current")).toContainText("البيانات والجوازات");
    // Step 2: air route defaults (editable), no border crossing field.
    await expect(app.locator('[name="departureCity"]')).toHaveValue("بورتسودان");
    await expect(app.locator('[name="arrivalAirport"]')).toHaveValue("القاهرة");
    await expect(app.locator('[name="entryPort"]')).toHaveCount(0);
    await app.fill('[name="t_name_0"]', "مسافر اختبار مصر");

    // Passport: a tiny camera photo is accepted with clear Arabic hints…
    const slot = app.locator(".passport-slot").first();
    await expect(slot.getByText("تصوير الجواز", { exact: true })).toBeVisible();
    await expect(slot.getByText("رفع صورة الجواز", { exact: true })).toBeVisible();
    await slot.locator('input[data-capture="CAMERA"]').setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: TINY_PNG });
    await expect(slot.locator(".quality-warnings")).toContainText("الصورة صغيرة", { timeout: 15_000 });
    await expect(slot.locator(".passport-preview")).toBeVisible();
    await expect(slot.getByText("إعادة التصوير", { exact: true })).toBeVisible();
    await shot(app, "egypt-02-passport-warning-390");
    // …then replaced from the gallery; a corrupt file is refused outright.
    await slot.locator('input[data-capture="UPLOAD"]').setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") });
    await expect(slot.locator(".slot-error")).toContainText("تعذّر فتح الصورة", { timeout: 15_000 });
    await slot.locator('input[data-capture="UPLOAD"]').setInputFiles({ name: "passport.png", mimeType: "image/png", buffer: SAMPLE_PASSPORT });
    await expect(app.locator(".passport-slot.slot-ok")).toHaveCount(1, { timeout: 15_000 });

    for (const key of [...new Set(await app.locator(".slot:not(.passport-slot) [data-slot-input]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slotInput || "")))]) {
      await app.locator(`[data-slot-input="${key}"]`).last().setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: PDF });
    }
    await app.fill('[name="name"]', "مسافر اختبار مصر");
    await app.fill('[name="phone"]', phone);
    await app.fill('[name="email"]', "not-an-email");
    await app.locator('[name="flightChoice"][value="REQUEST"]').check();
    await app.locator("#confirmTotal").check();
    await app.locator("#nextStepBtn").dispatchEvent("click");
    await expect(app.locator("#stepErrors")).toContainText("البريد الإلكتروني غير صالح");
    await app.fill('[name="email"]', "egypt-e2e@example.test");
    await shot(app, "egypt-03-details-390");
    await app.locator("#nextStepBtn").dispatchEvent("click");

    // Step 3: exact total, the agency's account with a copy button, receipt.
    await expect(app.getByTestId("direct-payment-step")).toBeVisible({ timeout: 30_000 });
    await expect(app.locator(".egypt-step-current")).toContainText("الدفع");
    await expect(app.locator("#directPaymentAmount")).toContainText("95");
    await expect(app.locator('[data-testid="payment-account"] [data-copy]').first()).toBeVisible();
    await shot(app, "egypt-04-payment-390");
    await app.locator('[name="settlementAccountId"]').first().check();
    await app.setInputFiles('#directReceiptForm [data-receipt-input="PDF"]', { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(app.locator("[data-receipt-name]")).toContainText("receipt.pdf");
    await app.locator("#sendReceiptBtn").click();
    await expect(app.locator("#requestReference")).toBeVisible({ timeout: 30_000 });
    airRequestId = (await app.locator("#requestReference").innerText()).trim();

    // Stored: email, route, flight choice and one linked booking inquiry (no price).
    const detail = (await (await office.request.get(`${BACKEND}/api/contact-requests/${airRequestId}`)).json()).data;
    expect(detail.email).toBe("egypt-e2e@example.test");
    expect(detail.intakeData.egyptFlight.choice).toBe("REQUEST");
    expect(detail.linkedRequests).toHaveLength(1);
    expect(detail.paymentStatus).toBe("UNDER_REVIEW");
    const passport = detail.documents.find((d: { classification: string; qualitySignal: unknown }) => d.classification === "CUSTOMER_DOCUMENT" && d.qualitySignal);
    expect(passport, "device hints stored with the passport").toBeTruthy();
    const linked = (await (await office.request.get(`${BACKEND}/api/contact-requests/${detail.linkedRequests[0].id}`)).json()).data;
    expect(linked.invoice).toBeNull();
    expect(linked.pricingMode).toBe("QUOTE");

    // A receipt uploaded is not a payment: the customer sees it under review.
    await openTracked(airRequestId);
    await expect(app.locator("#requestJourney .journey-stage-current")).toContainText("تم تأكيد الدفع");
    await shot(app, "egypt-05-tracking-review-390");
  });

  test("staff confirm payment (receipt PDF), accept documents, issue the approval; the customer sees and can download it", async () => {
    test.setTimeout(180_000);
    await openWorkspace(airRequestId);
    await staffAct(office.locator("[data-cr-confirm-payment]"), "تم تأكيد استلام الدفع");
    await expect.poll(async () => (await (await office.request.get(`${BACKEND}/api/contact-requests/${airRequestId}`)).json()).data.paymentReceipt?.pdfStatus, { timeout: 20_000 }).toBe("READY");
    const pdf = await office.request.get(`${BACKEND}/api/contact-requests/${airRequestId}/payment-receipt/file`);
    expect(pdf.ok()).toBeTruthy();
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    await openWorkspace(airRequestId);
    while ((await office.locator("[data-doc-accept]").count()) > 0) {
      const before = await office.locator("[data-doc-accept]").count();
      await office.locator("[data-doc-accept]").first().click();
      await expect(office.locator("[data-doc-accept]")).toHaveCount(before - 1, { timeout: 15_000 });
    }
    // The device's passport hints are shown to staff as hints (never a refusal).
    await expect(office.locator("#egypt-workspace")).toContainText("جودة صور الجواز");
    await office.locator("#egypt-approval-file").setInputFiles({ name: "approval.pdf", mimeType: "application/pdf", buffer: PDF });
    await staffAct(office.locator('[data-cr-form="egypt-approval"] button[type="submit"]'), "تم تسجيل إصدار الموافقة");
    await expect(office.locator("#egypt-workspace")).toContainText("الحالية — يراها العميل");
    if (SHOTS) await office.screenshot({ path: path.join(SHOTS, "egypt-admin-workspace.png"), fullPage: true });

    await openTracked(airRequestId);
    await expect(app.locator("#requestJourney .journey-headline")).toHaveText("تم إصدار الموافقة الأمنية");
    await expect(app.locator('[data-egypt-file="APPROVAL"]')).toHaveText(/تحميل الموافقة/);
    await expect(app.locator('[data-egypt-file="RECEIPT"]')).toHaveText(/تحميل إيصال السداد/);
    await expect(app.locator("#egyptPrep")).toContainText("مطلوب منك");
    await shot(app, "egypt-06-approval-issued-390");
    // The download needs the customer's verified session: without one, nothing.
    const anonymous = await playwrightRequest.newContext();
    expect((await anonymous.get(`${BACKEND}/api/tracking/requests/${airRequestId}/payment-receipt/file`)).status()).toBe(401);
    await anonymous.dispose();
  });

  test("travel preparation: date confirmed, staff ticket, circular PDF; staff schedule", async () => {
    test.setTimeout(180_000);
    const entry = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await app.locator("#egyptTravelBtn").click();
    await app.locator('#egyptPlanForm [name="bookingStatus"]').selectOption("NEEDS_NASAEM");
    await app.fill('#egyptPlanForm [name="entryDate"]', entry);
    await app.locator("#egyptPlanForm button[type=submit]").click();
    await expect(app.locator("#egyptPlanForm")).toBeVisible();
    await app.locator('#egyptPlanForm [name="confirmDate"]').check();
    await app.locator("#egyptPlanForm button[type=submit]").click();
    await expect(app.locator("#egyptPrep")).toContainText(entry, { timeout: 20_000 });
    await expect(app.locator("#egyptPrep")).toContainText("تذكرة الطيران لم تُرفع بعد");

    await openWorkspace(airRequestId);
    await office.locator("#egypt-ticket-file").setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: PDF });
    await staffAct(office.locator('[data-cr-form="egypt-ticket"] button[type="submit"]'), "تم إرفاق التذكرة");
    await staffAct(office.locator("[data-egypt-circular-start]"), "بدأ تجهيز التعميم");
    await office.locator("#egypt-circular-file").setInputFiles({ name: "circular.pdf", mimeType: "application/pdf", buffer: PDF });
    await staffAct(office.locator('[data-cr-form="egypt-circular"] button[type="submit"]'), "تم رفع التعميم");

    await openTracked(airRequestId);
    await expect(app.locator("#requestJourney .journey-headline")).toHaveText("تم إصدار التعميم");
    await expect(app.locator("#egyptCircularIssued")).toBeVisible();
    await expect(app.locator('[data-egypt-file="CIRCULAR"]')).toHaveText(/تحميل التعميم PDF/);
    await expect(app.locator('[data-egypt-file="TICKET"]')).toHaveText(/تحميل التذكرة/);
    await expect(app.locator("#requestJourney .journey-stage-done")).toHaveCount(6);
    await shot(app, "egypt-07-circular-issued-390");

    // The staff schedule: nearest date first, a reminder already scheduled.
    await office.goto(`${BACKEND}/admin-dashboard.html#/egypt`);
    const row = office.locator(`#egypt-body [data-egypt-id="${airRequestId}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(entry);
    await expect(row).toContainText("صدر");
    if (SHOTS) await office.screenshot({ path: path.join(SHOTS, "egypt-admin-schedule.png") });
    const workspace = (await (await office.request.get(`${BACKEND}/api/contact-requests/${airRequestId}/egypt`)).json()).data;
    expect(workspace.reminders.some((r: { status: string; kind: string }) => r.status === "SCHEDULED" && r.kind === "THREE_DAY")).toBeTruthy();
  });

  test("overland: border crossing only, submitted without a travel date and without any ticket", async () => {
    test.setTimeout(120_000);
    await home();
    await app.locator('[data-egypt-variant="VISA-EGYPT-CLEARANCE-BORDER"]').click();
    await expect(app.locator('[name="entryPort"]')).toBeVisible();
    await expect(app.locator('[name="departureCity"], [name="flightChoice"]')).toHaveCount(0);
    await app.fill('[name="t_name_0"]', "مسافر بري");
    await app.fill('[name="entryPort"]', "أرقين");
    await app.locator(".passport-slot").first().locator('input[data-capture="UPLOAD"]').setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(app.locator(".passport-slot.slot-ok")).toHaveCount(1, { timeout: 15_000 });
    for (const key of [...new Set(await app.locator(".slot:not(.passport-slot) [data-slot-input]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slotInput || "")))]) {
      await app.locator(`[data-slot-input="${key}"]`).last().setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: PDF });
    }
    await app.fill('[name="name"]', "مسافر بري");
    await app.fill('[name="phone"]', phone);
    await app.locator("#confirmTotal").check();
    await app.locator("#nextStepBtn").dispatchEvent("click");
    await expect(app.getByTestId("direct-payment-step")).toBeVisible({ timeout: 30_000 });
    // Pay later: the request is kept and offered again from home.
    await app.locator("#paymentLaterBtn").click();
    await expect(app.locator("#requestReference")).toBeVisible({ timeout: 30_000 });
    const id = (await app.locator("#requestReference").innerText()).trim();
    const stored = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(stored.intakeData.egyptRoute).toEqual({ entryMode: "BORDER", entryPort: "أرقين" });
    expect(stored.travelEntryDate).toBeNull();
    expect(stored.linkedRequests).toHaveLength(0);
  });
});
