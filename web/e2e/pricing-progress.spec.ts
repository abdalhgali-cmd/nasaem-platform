import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Fixed-price versus quote-required services, and the interactive request
// progress, in a browser: the customer app (mobile/www, Pixel 5 viewport,
// RTL) and the staff back-office against the real backend. The pricing mode
// is set explicitly in the back-office. Browser tests of the app's web
// bundle — NOT tests on an Android device.

const BACKEND = "http://localhost:5000";
const APP = "http://localhost:8081";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);

test.describe.serial("pricing modes and interactive progress", () => {
  const phone = `09${unique().slice(-8)}`;
  let appContext: BrowserContext;
  let app: Page;
  let office: Page;
  let usdAccountId = "";

  test.beforeAll(async ({ browser }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel } = devices["Pixel 5"];
    appContext = await browser.newContext({ ...pixel, baseURL: APP });
    app = await appContext.newPage();
    office = await (await browser.newContext({ locale: "ar" })).newPage();
    await loginAsSeededAdmin(office);
    // The agency's USD account: the app asks for a transfer receipt only when
    // there is an account to pay into.
    const account = await office.request.post(`${BACKEND}/api/payment-accounts`, {
      data: { name: "E2E pricing USD", bankName: "بنك اختبار التسعير", accountName: "نسائم الحرمين", accountNumber: `PPUSD${unique()}`, currency: "USD" },
    });
    expect(account.ok(), await account.text()).toBeTruthy();
    usdAccountId = (await account.json()).data.id;
  });

  test.afterAll(async () => {
    if (usdAccountId) await office?.request.patch(`${BACKEND}/api/payment-accounts/${usdAccountId}`, { data: { active: false } }).catch(() => undefined);
    await appContext?.close();
    await office?.context().close();
  });

  async function createVisa(name: string, basePrice: number, withDocument: boolean) {
    const created = await office.request.post(`${BACKEND}/api/visa-types`, {
      data: { code: `VISA-PRICE-${unique()}`, name, country: "اختبار", basePrice, currency: "USD", active: true, category: "INTERNATIONAL" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const id = (await created.json()).data.id as string;
    if (withDocument) {
      const requirement = await office.request.post(`${BACKEND}/api/visa-types/${id}/requirements`, {
        data: { name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true },
      });
      expect(requirement.ok(), await requirement.text()).toBeTruthy();
    }
    return id;
  }

  // The agency switches the item to a fixed price in the back-office.
  async function configureFixedInBackOffice(visaId: string, visaName: string, { perTraveler, afterDocuments }: { perTraveler: boolean; afterDocuments: boolean }) {
    await office.goto(`${BACKEND}/admin-dashboard.html`);
    await office.locator("#tabbtn-management").click();
    await office.locator('#mgmt-tabs [data-mgmt="visas"]').click();
    await office.locator(`[data-manage-requirements="${visaId}"]`).click();
    await expect(office.locator("#visa-requirements-title")).toHaveText(visaName);
    await expect(office.locator("#vt-edit-pricingMode")).toHaveValue("QUOTE");
    await office.locator("#vt-edit-pricingMode").selectOption("FIXED");
    await office.locator("#vt-edit-priceUnit").selectOption(perTraveler ? "PER_TRAVELER" : "PER_REQUEST");
    await office.locator("#vt-edit-paymentAfterDocumentReview").setChecked(afterDocuments);
    await office.locator("#visa-pricing-save-btn").click();
    await expect(office.getByText("تم حفظ طريقة التسعير.")).toBeVisible({ timeout: 15_000 });
    const stored = (await (await office.request.get(`${BACKEND}/api/visa-types/${visaId}`)).json()).data;
    expect([stored.pricingMode, stored.priceUnit, stored.paymentAfterDocumentReview]).toEqual(["FIXED", perTraveler ? "PER_TRAVELER" : "PER_REQUEST", afterDocuments]);
  }

  // First launch: the welcome's guest choice (remembered afterwards).
  async function home() {
    await app.goto("/index.html");
    const guest = app.locator("#continueAsGuest");
    await guest.or(app.locator(".hc-top")).first().waitFor({ timeout: 15_000 });
    if (await guest.isVisible().catch(() => false)) await guest.click();
    await expect(app.locator(".hc-top")).toBeVisible();
  }

  async function nextStep() {
    const button = app.locator("#nextStepBtn:not([disabled])");
    await button.waitFor();
    await button.dispatchEvent("click");
  }

  // The one requirements screen, filled up to the send button: travellers
  // (cards with their own documents), contact.
  async function fillRequest(visaName: string, travelers: string[]) {
    await home();
    await app.locator('.hc-tile[data-key="visas"]').click();
    await app.locator(".package-card", { hasText: visaName }).click();
    await app.locator("#startRequestBtn").click();
    await app.locator('[name="t_name_0"]').waitFor({ timeout: 15_000 });
    for (let index = 1; index < travelers.length; index += 1) await app.locator("#addTravelerBtn").click();
    for (const [index, traveler] of travelers.entries()) await app.fill(`[name="t_name_${index}"]`, traveler);
    await app.fill('[name="name"]', travelers[0]);
    await app.fill('[name="phone"]', phone);
    // Umrah asks for the guarantor's phone (required).
    if (await app.locator('[name="guarantorPhone"]').count()) await app.fill('[name="guarantorPhone"]', "+966501234567");
    // An Egypt passport slot has two inputs (camera, gallery): one file each.
    const keys = [...new Set(await app.locator("[data-slot-input]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slotInput || "")))];
    for (const key of keys) await app.locator(`[data-slot-input="${key}"]`).last().setInputFiles({ name: `doc-${key.slice(-4)}.png`, mimeType: "image/png", buffer: PNG });
    await expect(app.locator(".slot.slot-ok")).toHaveCount(await app.locator(".slot").count(), { timeout: 15_000 });
  }

  async function sendAndGetReference() {
    await nextStep();
    const reference = app.locator("#requestReference");
    const payment = app.getByTestId("direct-payment-step");
    await reference.or(payment).first().waitFor({ timeout: 30_000 });
    if (await payment.isVisible()) await app.locator("#paymentLaterBtn").click();
    await expect(reference).toBeVisible({ timeout: 30_000 });
    return (await reference.innerText()).trim();
  }

  async function openCustomerRequest(id: string) {
    await home();
    await app.locator('#bottomNav [data-tab="requests"]').click();
    const form = app.locator("#trackPhoneForm");
    const list = app.locator(".request-row").first();
    await form.or(list).first().waitFor({ timeout: 15_000 });
    if (await form.isVisible()) {
      await app.fill('#trackPhoneForm [name="phone"]', phone);
      await app.locator("#sendCodeBtn").click();
      await app.waitForSelector('#trackCodeForm [name="code"]');
      await app.fill('#trackCodeForm [name="code"]', readTrackingLoginCode(`249${phone.slice(1)}`));
      await app.locator("#verifyCodeBtn").click();
    }
    await app.locator(`.request-row[data-id="${id}"]`).click({ timeout: 15_000 });
    // The customer's view first; every server stage under «تفاصيل كل المراحل».
    await expect(app.locator("#requestJourney")).toBeVisible({ timeout: 15_000 });
    await app.locator("#requestJourney .journey-details summary").click();
    await expect(app.locator("#requestProgress")).toBeVisible();
  }

  const circle = (key: string) => app.locator(`#requestProgress [role="tab"][data-step="${key}"]`);
  const panel = () => app.locator("#progressStepPanel");

  async function staffAcceptDocuments(id: string) {
    const detail = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    for (const document of detail.documents.filter((d: { status: string; classification: string; supersededAt: string | null }) => d.status === "PENDING" && !d.supersededAt && d.classification !== "FINANCIAL_DOCUMENT")) {
      const res = await office.request.patch(`${BACKEND}/api/contact-requests/${id}/documents/${document.id}/status`, { data: { status: "ACCEPTED" } });
      expect(res.ok(), await res.text()).toBeTruthy();
    }
  }

  test("fixed price: total review and confirmation, no quote circle, payment after documents, tappable stages", async () => {
    test.setTimeout(240_000);
    const visaName = `تأشيرة بسعر ثابت ${unique()}`;
    const visaId = await createVisa(visaName, 120, true);
    await configureFixedInBackOffice(visaId, visaName, { perTraveler: true, afterDocuments: true });

    // ---- customer: details and documents, then the final total
    const travelers = [`مسافر ثابت ${unique()}`, `مرافق ${unique()}`];
    await fillRequest(visaName, travelers);
    // The total and its confirmation sit on the same screen, beside the send button.
    const total = app.locator("#fixedTotalReview");
    await expect(total).toBeVisible();
    await expect(app.locator("#fixedTotalAmount")).toContainText("240");
    await expect(app.locator("#fixedTotalAmount")).toContainText("USD");
    await expect(total).toContainText("×");
    await expect(total).toContainText("يُفتح الدفع بعد اعتماد الوكالة لمستنداتك");
    await expect(app.locator("#nextStepBtn")).toContainText("تأكيد الطلب بإجمالي");
    await expect(app.locator("#nextStepBtn")).toContainText("240");
    await nextStep();
    await expect(app.locator("#stepErrors")).toContainText("أكّد الإجمالي النهائي");
    await app.locator("#confirmTotal").check();
    const id = await sendAndGetReference();

    // ---- the server recorded the accepted fixed price (no second approval)
    const stored = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(stored.pricingMode).toBe("FIXED");
    expect(stored.invoice.status).toBe("APPROVED");
    expect(Number(stored.invoice.amount)).toBe(240);
    expect(stored.allowedActions).not.toContain("ISSUE_QUOTE");

    // ---- customer: the moments first (documents under review is not a step),
    // then the connected circles: no quote circle, payment locked
    await openCustomerRequest(id);
    await expect(app.locator("#requestJourney .journey-stage")).toHaveCount(4);
    // No stage label is internal review work (its status line may mention it).
    expect(await app.locator("#requestJourney .journey-text b").allInnerTexts()).not.toContain("مراجعة المستندات والبيانات");
    expect((await app.locator("#requestJourney .journey-text b").allInnerTexts()).some((label) => /مراجعة/.test(label))).toBe(false);
    await expect(app.locator("#journeyActionBtn")).toHaveCount(0);
    await expect(app.locator("#requestProgress")).toHaveAttribute("data-pricing-mode", "FIXED");
    await expect(circle("QUOTE")).toHaveCount(0);
    await expect(app.locator("#requestProgress [role=tab]")).toHaveCount(6);
    await expect(circle("RECEIVED")).toHaveAttribute("data-state", "done");
    await expect(circle("DOCUMENTS")).toHaveAttribute("aria-current", "step");
    await expect(circle("DOCUMENTS")).toHaveAttribute("aria-selected", "true");
    await expect(circle("DOCUMENTS")).toHaveAttribute("aria-label", /2 من 6: مراجعة المستندات والبيانات — المرحلة الحالية/);
    await expect(panel()).toContainText("بانتظار مراجعة الموظف");
    await expect(app.locator(".pay-state")).toContainText("الدفع بعد اعتماد المستندات");
    await expect(app.locator("#uploadReceiptBtn")).toHaveCount(0);
    await expect(app.locator("#approveBtn")).toHaveCount(0);

    // tap a completed stage: its real details
    await circle("RECEIVED").click();
    await expect(circle("RECEIVED")).toHaveAttribute("aria-selected", "true");
    await expect(panel()).toContainText("الإجمالي المؤكد");
    await expect(panel()).toContainText(id);

    // keyboard: one tab stop; arrows follow the RTL reading order
    await expect(app.locator('#requestProgress [role=tab][tabindex="0"]')).toHaveCount(1);
    await circle("RECEIVED").focus();
    await app.keyboard.press("ArrowLeft");
    await expect(circle("DOCUMENTS")).toBeFocused();
    await app.keyboard.press("ArrowLeft");
    await expect(circle("PAYMENT")).toBeFocused();
    await expect(circle("PAYMENT")).toHaveAttribute("aria-selected", "true");
    await expect(panel()).toContainText("يُفتح الدفع بعد اعتماد المستندات");
    await expect(panel().locator("[data-progress-target]")).toHaveCount(0);
    await app.keyboard.press("End");
    await expect(circle("DELIVERY")).toBeFocused();
    await app.keyboard.press("Home");
    await expect(circle("RECEIVED")).toBeFocused();
    await app.keyboard.press("ArrowRight");
    await expect(circle("RECEIVED")).toBeFocused();

    // mobile RTL layout: no horizontal page scroll
    expect(await app.evaluate(() => getComputedStyle(document.querySelector("#requestProgress")!).direction)).toBe("rtl");
    expect(await app.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // ---- staff approve the documents: payment opens at the same price
    await staffAcceptDocuments(id);
    await openCustomerRequest(id);
    await expect(circle("DOCUMENTS")).toHaveAttribute("data-state", "done");
    await expect(circle("PAYMENT")).toHaveAttribute("aria-current", "step");
    await expect(panel()).toContainText("بانتظار تحويل المبلغ ورفع إيصال الدفع");
    const action = panel().locator("[data-progress-target]");
    await expect(action).toHaveText("رفع إثبات الدفع");
    await action.click();
    await app.locator('#receiptForm input[name="file"]').setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF });
    await app.locator("#receiptForm button").click();
    await expect(app.locator(".pay-state")).toContainText("قيد المراجعة", { timeout: 15_000 });

    // a receipt upload is not an accepted payment
    await openCustomerRequest(id);
    await expect(circle("PAYMENT")).toHaveAttribute("data-state", "done");
    await expect(circle("PAYMENT_REVIEW")).toHaveAttribute("aria-current", "step");
    await expect(panel()).toContainText("لم يُقبل الدفع بعد");
    const invoice = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data.invoice;
    expect(Number(invoice.amount)).toBe(240);

    // execution started is not execution completed (service-specific label)
    expect((await office.request.post(`${BACKEND}/api/contact-requests/${id}/confirm-payment`, { data: {} })).ok()).toBeTruthy();
    expect((await office.request.post(`${BACKEND}/api/contact-requests/${id}/start-execution`, { data: {} })).ok()).toBeTruthy();
    await openCustomerRequest(id);
    await expect(circle("EXECUTION")).toHaveAttribute("data-state", "current");
    await expect(circle("EXECUTION")).toHaveAttribute("aria-label", /استخراج التأشيرة — قيد التنفيذ، لم تكتمل بعد/);
    await expect(app.locator("#requestProgress .progress-node-started")).toHaveCount(1);
    await expect(panel()).toContainText("بدأ التنفيذ ولم يكتمل بعد");
  });

  test("fixed price, payment open: straight to the payment screen, receipt → «بانتظار مراجعة التحويل», never paid", async () => {
    test.setTimeout(180_000);
    const visaName = `تأشيرة دفع مباشر ${unique()}`;
    const visaId = await createVisa(visaName, 90, true);
    await configureFixedInBackOffice(visaId, visaName, { perTraveler: false, afterDocuments: false });
    const accountNumber = `APPPAY${unique()}`;
    const account = await office.request.post(`${BACKEND}/api/payment-accounts`, {
      data: { name: `E2E ${accountNumber}`, bankName: "بنك التطبيق للاختبار", accountName: "وكالة الاختبار", accountNumber, currency: "USD" },
    });
    expect(account.ok(), await account.text()).toBeTruthy();
    const accountId = (await account.json()).data.id as string;
    try {
      await fillRequest(visaName, [`مسافر دفع ${unique()}`]);
      await expect(app.locator("#fixedTotalReview")).toContainText("بعد تأكيد الطلب تظهر لك تعليمات التحويل مباشرة");
      await app.locator("#confirmTotal").check();
      await nextStep();

      await expect(app.getByTestId("direct-payment-step")).toBeVisible({ timeout: 30_000 });
      // App closed / reloaded during payment: the home screen offers to finish it.
      await home();
      await app.locator("#resumePaymentBtn").click();
      await expect(app.locator("#paymentResumed")).toBeVisible({ timeout: 15_000 });
      const step = app.getByTestId("direct-payment-step");
      await expect(step).toBeVisible({ timeout: 30_000 });
      await expect(app.locator("#directPaymentAmount")).toContainText("USD");
      await expect(step.getByTestId("payment-account").filter({ hasText: accountNumber })).toContainText("بنك التطبيق للاختبار");
      await step.locator('input[name="file"]').setInputFiles({ name: "transfer.pdf", mimeType: "application/pdf", buffer: PDF });
      const uploaded = app.waitForResponse((r) => r.url().includes("/payment-access/receipt"));
      await app.locator("#sendReceiptBtn").click();
      expect((await uploaded).status()).toBe(201);

      await expect(app.locator("#requestReference")).toBeVisible({ timeout: 15_000 });
      await expect(app.locator("#submittedPaymentStatus")).toHaveText("بانتظار مراجعة التحويل");
      const id = (await app.locator("#requestReference").innerText()).trim();
      await home();
      await expect(app.locator("#resumePaymentBtn")).toHaveCount(0);
      const sameCustomer = (await (await office.request.get(`${BACKEND}/api/contact-requests?limit=20&search=${encodeURIComponent(id)}`)).json()).data as Array<{ id: string }>;
      expect(sameCustomer.map((row) => row.id)).toEqual([id]);
      const stored = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
      expect(stored.pricingMode).toBe("FIXED");
      expect(stored.paymentStatus).toBe("UNDER_REVIEW");
      expect(stored.paymentConfirmedAt).toBeNull();
    } finally {
      await office.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } });
    }
  });

  test("a price changed by the agency after the review is refused and re-confirmed", async () => {
    test.setTimeout(180_000);
    const visaName = `تأشيرة سعر متغير ${unique()}`;
    const visaId = await createVisa(visaName, 100, false);
    await configureFixedInBackOffice(visaId, visaName, { perTraveler: false, afterDocuments: false });
    await fillRequest(visaName, [`مسافر ${unique()}`]);
    await expect(app.locator("#fixedTotalAmount")).toContainText("100");
    const changed = await office.request.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { basePrice: 130 } });
    expect(changed.ok()).toBeTruthy();
    await app.locator("#confirmTotal").check();
    await nextStep();
    await expect(app.locator("#stepErrors")).toContainText("تغيّر سعر الخدمة");
    await expect(app.locator("#fixedTotalAmount")).toContainText("130");
    await expect(app.locator("#confirmTotal")).not.toBeChecked();
    await app.locator("#confirmTotal").check();
    const id = await sendAndGetReference();
    const stored = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(Number(stored.invoice.amount)).toBe(130);

    // payment is open right away (no document review configured)
    await openCustomerRequest(id);
    await expect(circle("QUOTE")).toHaveCount(0);
    await expect(app.locator("#uploadReceiptBtn")).toBeVisible();
  });

  test("quote-required: the agency quote and the version-checked approval stay", async () => {
    test.setTimeout(180_000);
    const visaName = `تأشيرة بعرض سعر ${unique()}`;
    await createVisa(visaName, 90, false);
    await fillRequest(visaName, [`مسافر عرض ${unique()}`]);
    await expect(app.locator("#fixedTotalReview")).toHaveCount(0);
    await expect(app.getByText("السعر النهائي وتعليمات الدفع تصلك بعد مراجعة الوكالة")).toBeVisible();
    await expect(app.locator("#nextStepBtn")).toHaveText("إرسال الطلب للوكالة");
    const id = await sendAndGetReference();
    const stored = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(stored.pricingMode).toBe("QUOTE");
    expect(stored.invoice).toBeNull();

    const priced = await office.request.post(`${BACKEND}/api/contact-requests/${id}/invoice`, { data: { amount: 95, currency: "USD", description: "عرض الوكالة" } });
    expect(priced.ok(), await priced.text()).toBeTruthy();
    await openCustomerRequest(id);
    await expect(app.locator("#requestProgress")).toHaveAttribute("data-pricing-mode", "QUOTE");
    await expect(circle("QUOTE")).toHaveAttribute("aria-current", "step");
    await expect(panel()).toContainText("عرض السعر بانتظار موافقتك");
    await panel().locator("[data-progress-target]").click();
    await expect(app.locator("#quoteBlock")).toBeFocused();
    await app.locator("#approveBtn").click();
    await expect(app.locator("#uploadReceiptBtn")).toBeVisible({ timeout: 15_000 });
    await openCustomerRequest(id);
    await expect(circle("QUOTE")).toHaveAttribute("data-state", "done");
    await expect(circle("PAYMENT")).toHaveAttribute("aria-current", "step");
  });

  test("reduced motion: the current circle does not animate", async ({ browser }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel } = devices["Pixel 5"];
    const animationOf = async (context: BrowserContext) => {
      const page = await context.newPage();
      await page.goto(`${APP}/index.html`);
      // Rendered with the app's own stylesheet and builder.
      return page.evaluate(async () => {
        const modulePath = "/js/progress-view.js";
        const { progressBlockHtml } = await import(/* @vite-ignore */ modulePath);
        const host = document.createElement("div");
        host.dir = "rtl";
        host.innerHTML = progressBlockHtml(
          { label: "x", steps: [{ key: "RECEIVED", label: "أ", state: "done" }, { key: "DOCUMENTS", label: "ب", state: "current" }] },
          (v: unknown) => String(v)
        );
        document.body.appendChild(host);
        return getComputedStyle(host.querySelector(".progress-node-current .progress-circle")!).animationName;
      });
    };
    const normal = await browser.newContext({ ...pixel });
    const reduced = await browser.newContext({ ...pixel, reducedMotion: "reduce" });
    expect(await animationOf(normal)).toBe("progress-ring");
    expect(await animationOf(reduced)).toBe("none");
    await normal.close();
    await reduced.close();
  });
});
