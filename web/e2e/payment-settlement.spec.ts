import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import { loginAsSeededAdmin } from "./helpers";

// Issue #132, end to end against the real backend: the agency marks an SDG
// account «يقبل المقابل بالجنيه» in the back-office; a customer with a USD
// invoice sees it on the payment screen with the SDG amount frozen on the
// invoice, chooses it, picks the receipt (camera → replaced by a PDF, with a
// preview), survives a network failure with a retry, and ends «بانتظار
// مراجعة الدفع» — never paid. The staff see the receipt with what was paid
// and where, download it, and confirm; the paid receipt records the SDG
// settlement while the invoice stays 85 USD. Browser tests of the app bundle
// at phone widths — NOT an Android device.

const BACKEND = "http://localhost:5000";
const APP = "http://localhost:8081";
const SHOTS = process.env.EGYPT_SHOTS_DIR || "";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.serial("USD invoice settled in SDG into an agency-approved account", () => {
  let office: Page;
  let appContext: BrowserContext;
  let app: Page;
  let previousRates: Record<string, number> | null = null;
  let accountNumber = "";
  let accountId = "";
  let visaId = "";
  let requestId = "";
  let paymentAccess: { token: string; expiresAt: string } | null = null;
  const customerName = `عميل سداد ${unique()}`;

  test.beforeAll(async ({ browser }) => {
    office = await (await browser.newContext({ locale: "ar", viewport: { width: 1280, height: 900 } })).newPage();
    await loginAsSeededAdmin(office);
    previousRates = (await (await office.request.get(`${BACKEND}/api/flights/admin/rates`)).json()).data;
    expect((await office.request.patch(`${BACKEND}/api/flights/admin/rates`, { data: { ...previousRates, USD: 9200 } })).ok()).toBeTruthy();
    const visa = await office.request.post(`${BACKEND}/api/visa-types`, {
      data: { code: `E2E-SETTLE-${unique()}`, name: `تأشيرة سداد ${unique()}`, country: "TEST", basePrice: 85, currency: "USD", active: true, pricingMode: "FIXED" },
    });
    expect(visa.ok(), await visa.text()).toBeTruthy();
    visaId = (await visa.json()).data.id;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel } = devices["Pixel 5"];
    appContext = await browser.newContext({ ...pixel, viewport: { width: 360, height: 780 }, baseURL: APP, locale: "ar" });
    app = await appContext.newPage();
  });

  test.afterAll(async () => {
    if (accountId) await office.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } }).catch(() => undefined);
    if (visaId) await office.request.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { active: false } }).catch(() => undefined);
    if (previousRates) await office.request.patch(`${BACKEND}/api/flights/admin/rates`, { data: previousRates }).catch(() => undefined);
    await appContext?.close();
    await office?.context().close();
  });

  test("the administrator adds an SDG account that accepts the SDG equivalent (the option exists only for SDG)", async () => {
    await office.goto(`${BACKEND}/admin-dashboard.html`);
    await office.locator("#tabbtn-management").click();
    await office.locator('#mgmt-tabs button[data-mgmt="payment-accounts"]').click();
    await expect(office.locator("#payment-account-create-card")).toBeVisible({ timeout: 15_000 });
    accountNumber = `SDG${unique()}`;
    await office.fill("#pa-name", `حساب جنيه ${accountNumber}`);
    await office.fill("#pa-bank", "بنك الجنيه للاختبار");
    await office.fill("#pa-holder", "وكالة الاختبار");
    await office.fill("#pa-number", accountNumber);
    await office.selectOption("#pa-currency", "USD");
    await expect(office.locator("#pa-foreign")).toBeDisabled();
    await office.selectOption("#pa-currency", "SDG");
    await expect(office.locator("#pa-foreign")).toBeEnabled();
    await office.locator("#pa-foreign").check();
    await office.locator("#payment-account-save-btn").click();
    const row = office.locator("#payment-accounts-body tr", { hasText: accountNumber });
    await expect(row).toContainText("مقبول", { timeout: 15_000 });
    const accounts = (await (await office.request.get(`${BACKEND}/api/payment-accounts`)).json()).data as Array<{ id: string; accountNumber: string; acceptsForeignInvoices: boolean }>;
    const created = accounts.find((a) => a.accountNumber === accountNumber);
    expect(created?.acceptsForeignInvoices).toBe(true);
    accountId = created!.id;
  });

  test("the customer chooses the SDG account, previews and replaces the receipt, retries after a network failure (360px)", async () => {
    const created = await app.request.post(`${BACKEND}/api/contact-requests`, {
      multipart: { name: customerName, phone: `091${unique().slice(-7)}`, message: "E2E سداد", visaTypeId: visaId, travelerCount: "1", acceptedTotal: "85.00", acceptedCurrency: "USD" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const data = (await created.json()).data;
    requestId = data.id;
    paymentAccess = data.paymentAccess;
    expect(paymentAccess?.token).toBeTruthy();

    // The app was closed after submission: the home screen offers «أكمل الدفع».
    await app.goto("/index.html");
    await app.evaluate((pending) => localStorage.setItem("nasaem.pendingPayment.v1", JSON.stringify(pending)), { id: requestId, paymentAccess, serviceName: "تأشيرة سداد", travelerCount: 1 });
    await app.reload();
    const guest = app.locator("#continueAsGuest");
    await guest.or(app.locator("#resumePaymentBtn")).first().waitFor({ timeout: 15_000 });
    if (await guest.isVisible().catch(() => false)) await guest.click();
    await app.locator("#resumePaymentBtn").click();

    const step = app.getByTestId("direct-payment-step");
    await expect(step).toBeVisible({ timeout: 30_000 });
    await expect(app.locator("#directPaymentAmount")).toContainText("85");
    await expect(app.locator("#directPaymentAmount")).toContainText("USD");
    const card = step.getByTestId("payment-account").filter({ hasText: accountNumber });
    await expect(card).toHaveAttribute("data-settlement-kind", "SDG_EQUIVALENT");
    await expect(card).toContainText("782,000 SDG");
    await expect(card).toContainText("9,200");
    await expect(card.locator(`[data-copy="${accountNumber}"]`)).toBeVisible();

    // No account chosen yet (more than one may be offered): the app asks.
    const radios = step.locator('[name="settlementAccountId"]');
    if ((await radios.count()) > 1) {
      await app.locator("#sendReceiptBtn").click();
      await expect(app.locator("[data-receipt-error]")).toContainText("اختر الحساب");
    }
    await card.locator('[name="settlementAccountId"]').check();
    await app.locator("#sendReceiptBtn").click();
    await expect(app.locator("[data-receipt-error]")).toContainText("صوّر إشعار التحويل");

    // Camera (rear) → image preview; replaced by a PDF → its name.
    await expect(step.locator('[data-receipt-input="CAMERA"]')).toHaveAttribute("capture", "environment");
    await step.locator('[data-receipt-input="CAMERA"]').setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: PNG });
    await expect(step.locator(".receipt-preview-img")).toBeVisible();
    if (SHOTS) await app.screenshot({ path: path.join(SHOTS, "receipt-sdg-preview-360.png"), fullPage: true });
    await step.locator('[data-receipt-input="PDF"]').setInputFiles({ name: "transfer.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(step.locator(".receipt-preview-img")).toHaveCount(0);
    await expect(step.locator("[data-receipt-name]")).toContainText("transfer.pdf");
    // A file type the server refuses never leaves the phone.
    await step.locator('[data-receipt-input="GALLERY"]').setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await expect(app.locator("[data-receipt-error]")).toContainText("نوع الملف غير مدعوم");
    await expect(step.locator("[data-receipt-name]")).toContainText("transfer.pdf");

    for (const width of [360, 390]) {
      await app.setViewportSize({ width, height: 780 });
      const overflow = await app.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(false);
    }

    // Network failure: an error with a retry, the chosen file kept, nothing stored.
    await app.route("**/payment-access/receipt", (route) => route.abort("internetdisconnected"));
    await app.locator("#sendReceiptBtn").click();
    await expect(app.locator("[data-receipt-error]")).toContainText("تعذّر الاتصال", { timeout: 15_000 });
    await expect(app.locator("#sendReceiptBtn")).toHaveText("إعادة المحاولة");
    await app.unroute("**/payment-access/receipt");
    const stillAwaiting = (await (await office.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(stillAwaiting.paymentStatus).toBe("AWAITING_TRANSFER");

    const uploaded = app.waitForResponse((r) => r.url().includes("/payment-access/receipt"));
    await app.locator("#sendReceiptBtn").click();
    expect((await uploaded).status()).toBe(201);
    await expect(app.locator("#submittedPaymentStatus")).toHaveText("بانتظار مراجعة الدفع", { timeout: 15_000 });
    if (SHOTS) await app.screenshot({ path: path.join(SHOTS, "receipt-under-review-390.png"), fullPage: true });

    // Reopening the link shows the review state, no second upload form.
    const again = await app.request.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: { "X-Payment-Access": paymentAccess!.token } });
    const summary = (await again.json()).data;
    expect(summary.paymentStatus).toBe("UNDER_REVIEW");
    expect(summary.settlementOptions).toEqual([]);
  });

  test("the staff see the receipt with the SDG settlement, download it and confirm; the invoice stays 85 USD", async () => {
    await office.goto(`${BACKEND}/admin-dashboard.html`);
    await office.locator("#tabbtn-requests").click();
    await office.fill("#cr-search", customerName);
    const row = office.locator(`#cr-body tr[data-cr-id="${requestId}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    const receipts = office.locator("[data-cr-transfer-receipts]");
    await expect(receipts).toBeVisible({ timeout: 15_000 });
    await expect(receipts).toContainText("782,000");
    await expect(receipts).toContainText("SDG");
    await expect(receipts).toContainText("بنك الجنيه للاختبار");
    await expect(receipts).toContainText(accountNumber);
    const href = await receipts.locator("a[download]").first().getAttribute("href");
    const file = await office.request.get(`${BACKEND}${href}`);
    expect(file.status()).toBe(200);
    if (SHOTS) await office.screenshot({ path: path.join(SHOTS, "admin-transfer-receipt.png"), fullPage: true });

    // The payment token never opens the staff record.
    const viaToken = await app.request.get(`${BACKEND}/api/contact-requests/${requestId}`, { headers: { "X-Payment-Access": paymentAccess!.token } });
    expect([401, 403]).toContain(viaToken.status());

    office.once("dialog", (dialog) => dialog.accept());
    expect((await office.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { data: {} })).ok()).toBeTruthy();
    const detail = (await (await office.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(detail.paymentStatus).toBe("CONFIRMED");
    expect([Number(detail.invoice.amount), detail.invoice.currency, Number(detail.invoice.amountSdg)]).toEqual([85, "USD", 782000]);
  });
});
