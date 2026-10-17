import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Every service, end to end, in a browser: the customer app (mobile/www)
// and the staff back-office (backend/public) against the real backend.
// selection -> travelers -> each traveler's documents -> staff finds the
// request and reviews documents -> price -> customer approves -> receipt ->
// staff rejects (with a reason) or accepts -> "awaiting execution" ->
// staff records execution -> service-specific stage -> final file.
// These are browser tests of the app's web bundle. They are NOT tests on an
// Android device.

const BACKEND = "http://localhost:5000";
const APP = "http://localhost:8081";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
const AWAITING = "تم قبول الدفع، بانتظار بدء التنفيذ";

type Journey = {
  name: string;
  execution: string;
  start: (app: Page) => Promise<void>;
  rejectFirstDocument?: boolean;
  rejectFirstReceipt?: boolean;
  // Seeded flights/ferries/hotels have no document requirement; for the run
  // a clearly-labelled TEST-WF requirement is configured through the admin
  // API (and removed afterwards) so their document path is exercised.
  testRequirementService?: string;
  // Egypt clearance continues after the approval file: travel plan, then
  // staff complete the request.
  travelPlan?: boolean;
  // Fixed catalog price confirmed at submission: no staff quote, no approval.
  fixedPrice?: { total: string; currency: string };
};

const visaName = `تأشيرة سياحية تركيا ${unique()}`;

async function shortcut(app: Page, key: string) {
  await app.locator(`.shortcut[data-key="${key}"]`).click();
  await app.locator("#startRequestBtn").click();
}

const JOURNEYS: Journey[] = [
  {
    name: "flights",
    execution: "جارٍ إصدار تذكرة الطيران",
    testRequirementService: "SVC-FLIGHT",
    rejectFirstReceipt: true,
    start: async (app) => {
      await shortcut(app, "flights");
      await app.fill('#flightSearchForm [name="from"]', "KRT");
      await app.fill('#flightSearchForm [name="to"]', "JED");
      await app.fill('#flightSearchForm [name="date"]', "2030-02-10");
      await app.locator("#flightSearchBtn").click();
      await app.locator("#requestWithoutSelection").click();
    },
  },
  {
    name: "ferries",
    execution: "جارٍ إصدار تذكرة العبّارة",
    testRequirementService: "SVC-FERRY",
    start: async (app) => {
      await shortcut(app, "ferries");
      const route = app.locator('#ferryForm [name="route"]');
      if (await route.count()) {
        const options = await route.locator("option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value).filter(Boolean));
        await route.selectOption(options[0]);
      } else {
        await app.fill('#ferryForm [name="origin"]', "بورتسودان");
        await app.fill('#ferryForm [name="destination"]', "جدة");
      }
      await app.fill('#ferryForm [name="travelDate"]', "2030-02-10");
      await app.locator("#ferrySubmitBtn").click();
    },
  },
  {
    name: "hotels",
    execution: "جارٍ تأكيد حجز الفندق",
    testRequirementService: "SVC-HOTEL",
    start: async (app) => {
      await app.locator('#bottomNav [data-tab="services"]').click();
      await app.locator(".svc-card", { hasText: "حجز الفنادق" }).first().click();
      await app.locator("#startRequestBtn").click();
      await app.fill('#hotelForm [name="checkin"]', "2030-02-10");
      await app.fill('#hotelForm [name="checkout"]', "2030-02-14");
      await app.fill('#hotelForm [name="rooms"]', "2");
      await app.locator("#hotelSubmitBtn").click();
    },
  },
  {
    name: "Umrah",
    execution: "جارٍ إصدار التأشيرة",
    start: async (app) => {
      await shortcut(app, "umrah");
      await app.locator(".package-card").first().click();
    },
  },
  {
    name: "family visit",
    execution: "جارٍ استخراج تأشيرة الزيارة العائلية",
    start: async (app) => shortcut(app, "family"),
  },
  {
    name: "Egypt clearance",
    execution: "جارٍ استخراج الموافقة الأمنية",
    travelPlan: true,
    // The air variant, priced for this run in beforeAll (test fixture price).
    fixedPrice: { total: "240", currency: "USD" },
    start: async (app) => {
      await shortcut(app, "egypt");
      await app.locator('.variant-card[data-code="VISA-EGYPT-CLEARANCE-AIR"]').click();
    },
  },
  {
    name: "visa configured in the back-office",
    execution: "جارٍ استخراج التأشيرة",
    rejectFirstDocument: true,
    start: async (app) => {
      await app.locator('.shortcut[data-key="visas"]').click();
      await app.locator(".package-card", { hasText: visaName }).click();
      await app.locator("#startRequestBtn").click();
    },
  },
];

test.describe.serial("service journeys: customer app and back-office, in the browser", () => {
  const phone = `09${unique().slice(-8)}`;
  let appContext: BrowserContext;
  let app: Page;
  let office: Page;
  const testRequirementIds: string[] = [];
  let egyptAirId = "";

  test.beforeAll(async ({ browser }) => {
    // One customer device for all journeys: the phone is verified once (the
    // tracking code limiter allows 5 codes per 15 minutes) and kept.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...pixel } = devices["Pixel 5"];
    appContext = await browser.newContext({ ...pixel, baseURL: APP });
    app = await appContext.newPage();
    office = await (await browser.newContext({ locale: "ar" })).newPage();
    await loginAsSeededAdmin(office);

    // Egypt clearance is booked per entry-method variant at its fixed price;
    // the seed creates the variants inactive and unpriced. Test fixture price.
    const visaList = (await (await office.request.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string }>;
    egyptAirId = visaList.find((v) => v.code === "VISA-EGYPT-CLEARANCE-AIR")?.id || "";
    expect(egyptAirId, "seeded Egypt air variant").toBeTruthy();
    const priced = await office.request.patch(`${BACKEND}/api/visa-types/${egyptAirId}`, { data: { pricingMode: "FIXED", basePrice: 120, currency: "USD", priceUnit: "PER_TRAVELER", active: true } });
    expect(priced.ok(), await priced.text()).toBeTruthy();

    // A visa type the back-office configures now, with a per-traveler document.
    const created = await office.request.post(`${BACKEND}/api/visa-types`, {
      data: { code: `VISA-E2E-${unique()}`, name: visaName, country: "تركيا", basePrice: 0, currency: "USD", active: true },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const visaTypeId = (await created.json()).data.id;
    const requirement = await office.request.post(`${BACKEND}/api/visa-types/${visaTypeId}/requirements`, {
      data: { name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true },
    });
    expect(requirement.ok(), await requirement.text()).toBeTruthy();

    const catalog = (await (await office.request.get(`${BACKEND}/api/services/public`)).json()).data.services as { id: string; code: string }[];
    for (const journey of JOURNEYS.filter((j) => j.testRequirementService)) {
      const service = catalog.find((candidate) => candidate.code === journey.testRequirementService);
      expect(service, journey.testRequirementService).toBeTruthy();
      const added = await office.request.post(`${BACKEND}/api/services/${service!.id}/requirements`, {
        data: { name: "TEST-WF صورة الجواز (اختبار)", type: "DOCUMENT", scope: "TRAVELER", required: true },
      });
      expect(added.ok(), await added.text()).toBeTruthy();
      testRequirementIds.push((await added.json()).data.id);
    }
  });

  test.afterAll(async () => {
    if (egyptAirId) await office?.request.patch(`${BACKEND}/api/visa-types/${egyptAirId}`, { data: { pricingMode: "QUOTE", active: false } }).catch(() => undefined);
    for (const id of testRequirementIds) await office?.request.delete(`${BACKEND}/api/services/requirements/${id}`).catch(() => undefined);
    await appContext?.close();
    await office?.context().close();
  });

  async function home() {
    await app.goto("/index.html");
    const skip = app.getByText("تخطي").first();
    await skip.waitFor({ timeout: 10_000 }).catch(() => undefined);
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(app.locator(".home-hero")).toBeVisible();
  }

  async function answerAgencyQuestions() {
    const fields = app.locator("#answersSection [data-req]");
    for (let i = 0; i < (await fields.count()); i += 1) {
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

  // The wizard scrolls smoothly to each step; the button is pressed once the
  // step is ready, without waiting for the scroll to settle.
  async function nextStep() {
    const button = app.locator("#nextStepBtn:not([disabled])");
    await button.waitFor();
    await button.dispatchEvent("click");
  }

  async function submitIntake(travelers: string[]) {
    await app.fill('[name="name"]', travelers[0]);
    await app.fill('[name="phone"]', phone);
    // Umrah asks for the guarantor's phone (required).
    if (await app.locator('[name="guarantorPhone"]').count()) await app.fill('[name="guarantorPhone"]', "+966501234567");
    await app.fill("#travelerCount", String(travelers.length));
    await app.dispatchEvent("#travelerCount", "change");
    for (const [index, traveler] of travelers.entries()) {
      await app.fill(`[name="t_name_${index}"]`, traveler);
      await app.fill(`[name="t_pass_${index}"]`, `P${unique()}${index}`);
    }
    await answerAgencyQuestions();
    await nextStep();
    // A service with no configured documents goes straight to the review.
    const review = app.getByText("راجع طلبك قبل الإرسال");
    await app.locator("[data-slot-input]").first().or(review).waitFor();
    const keys = await app.locator("[data-slot-input]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.slotInput || ""));
    if (keys.length) {
      for (const key of keys) await app.locator(`[data-slot-input="${key}"]`).setInputFiles(png(`doc-${key.slice(-6)}.png`));
      await nextStep();
    }
    await expect(review).toBeVisible();
    // A fixed price is confirmed once, here, before sending.
    if (await app.locator("#confirmTotal").count()) await app.locator("#confirmTotal").check();
    await nextStep();
    const reference = app.locator("#requestReference");
    // A fixed price with payment open goes straight to the payment screen;
    // this journey pays through tracking, so it continues with «سأحوّل لاحقًا».
    const payment = app.getByTestId("direct-payment-step");
    await reference.or(payment).first().waitFor({ timeout: 30_000 });
    if (await payment.isVisible()) {
      await expect(app.locator("#directPaymentAmount")).not.toBeEmpty();
      await app.locator("#paymentLaterBtn").click();
    }
    await expect(reference).toBeVisible({ timeout: 30_000 });
    return { id: (await reference.innerText()).trim(), documents: keys.length };
  }

  // The customer's request detail, through phone tracking (code read from
  // the database the first time, as a tester reads the delivery log).
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
    await expect(app.locator("#requestProgress")).toBeVisible({ timeout: 15_000 });
  }

  // Staff find the request the way they would: search by the traveler's name.
  async function openStaffRequest(id: string, travelerName: string) {
    await office.goto(`${BACKEND}/admin-dashboard.html`);
    await office.locator("#tabbtn-requests").click();
    await office.fill("#cr-search", travelerName);
    const row = office.locator(`#cr-body tr[data-cr-id="${id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(office.locator("#cr-body tr")).toHaveCount(1);
    await row.click();
    await expect(office.locator("#cr-detail-title")).toBeVisible({ timeout: 15_000 });
  }

  async function staffAct(locator: ReturnType<Page["locator"]>, success: string) {
    await locator.click();
    await expect(office.locator("#cr-action-alert")).toContainText(success, { timeout: 15_000 });
  }

  async function bothSay(label: string) {
    await expect(office.locator("[data-cr-progress-label]")).toHaveText(label);
    await expect(app.locator("#requestProgress .progress-label")).toHaveText(label);
  }

  for (const journey of JOURNEYS) {
    test(`${journey.name}: request, documents, price, payment, execution, delivery`, async () => {
      test.setTimeout(240_000);
      const travelers = [`مسافر ${journey.name} ${unique()}`, `مرافق ${unique()}`];

      // ---- customer: service, its selection, travelers, documents
      await home();
      await journey.start(app);
      const { id, documents } = await submitIntake(travelers);

      // ---- staff: find it, check each traveler's documents, review them
      await openStaffRequest(id, travelers[0]);
      const detail = office.locator("#cr-detail");
      await expect(detail).toContainText(travelers[1]);
      await expect(detail.locator("[data-doc-accept]")).toHaveCount(documents);
      if (journey.rejectFirstDocument) {
        const docId = await detail.locator("[data-doc-reject]").first().getAttribute("data-doc-reject");
        await office.fill(`#reject-note-${docId}`, "الصورة غير واضحة");
        await staffAct(detail.locator(`[data-doc-reject="${docId}"]`), "تم رفض المستند");
        await openCustomerRequest(id);
        const rejected = app.locator(".check-row.check-rejected");
        await expect(rejected).toContainText("الصورة غير واضحة");
        await rejected.locator("input[type=file]").setInputFiles(png("replacement.png"));
        await expect(app.locator(".check-row.check-rejected")).toHaveCount(0, { timeout: 15_000 });
        await openStaffRequest(id, travelers[0]);
      }
      while ((await detail.locator("[data-doc-accept]").count()) > 0) {
        const before = await detail.locator("[data-doc-accept]").count();
        await detail.locator("[data-doc-accept]").first().click();
        await expect(detail.locator("[data-doc-accept]")).toHaveCount(before - 1, { timeout: 15_000 });
      }

      if (journey.fixedPrice) {
        // ---- fixed price: confirmed at submission; no staff quote, no approval
        await openCustomerRequest(id);
        await expect(app.locator(".quote-amount")).toContainText(journey.fixedPrice.total);
        await expect(app.locator(".quote-amount")).toContainText(journey.fixedPrice.currency);
        await expect(app.locator("#approveBtn")).toHaveCount(0);
      } else {
        // ---- staff: price
        const kind = detail.locator("#cr-price-kind");
        if (await kind.count()) await kind.selectOption("invoice");
        await office.fill("#cr-amount", "350");
        await office.locator("#cr-currency").selectOption("USD");
        await staffAct(detail.locator('[data-cr-form="invoice"] button[type="submit"], [data-cr-form="offer"] button[type="submit"]').first(), "تم حفظ السعر");

        // ---- customer: approve
        await openCustomerRequest(id);
        await expect(app.locator(".quote-amount")).toContainText("USD");
        await app.locator("#approveBtn").click();
      }
      // ---- customer: payment details and receipt (one panel)
      await expect(app.locator("#uploadReceiptBtn")).toBeVisible({ timeout: 15_000 });
      await app.locator("#uploadReceiptBtn").click();
      await app.locator('#receiptForm input[name="file"]').setInputFiles({ name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF });
      await app.locator("#receiptForm button").click();
      await expect(app.locator(".pay-state")).toContainText("قيد المراجعة", { timeout: 15_000 });

      // ---- staff: reject with a reason (once), then accept
      if (journey.rejectFirstReceipt) {
        // the receipt notification opens this exact request
        await office.goto(`${BACKEND}/admin-dashboard.html`);
        await office.locator("#notif-btn").click();
        const notification = office.locator(`.notif-item[data-notif-href*="${id}"]`).first();
        await expect(notification).toBeVisible({ timeout: 15_000 });
        await notification.click();
        await expect(office).toHaveURL(new RegExp(`#/requests/${id}`), { timeout: 15_000 });
        await expect(detail).toContainText(travelers[0], { timeout: 15_000 });
      } else {
        await openStaffRequest(id, travelers[0]);
      }
      await expect(detail.locator("[data-cr-progress-label]")).toHaveText("بانتظار مراجعة إثبات التحويل");
      // the receipt is decided in the payment section, not as a document
      await expect(detail.locator("[data-doc-accept]")).toHaveCount(0);
      await expect(detail).toContainText("إيصال دفع — يُراجع من قسم «الدفع»");
      if (journey.rejectFirstReceipt) {
        await office.fill("#cr-reject-payment-reason", "المبلغ غير مطابق");
        await staffAct(detail.locator('[data-cr-form="reject-payment"] button[type="submit"]'), "تم رفض الإيصال");
        await openCustomerRequest(id);
        await expect(app.locator(".pay-state-bad")).toContainText("المبلغ غير مطابق");
        await app.locator("#uploadReceiptBtn").click();
        await app.locator('#receiptForm input[name="file"]').setInputFiles({ name: "receipt2.pdf", mimeType: "application/pdf", buffer: PDF });
        await app.locator("#receiptForm button").click();
        await expect(app.locator(".pay-state")).toContainText("قيد المراجعة", { timeout: 15_000 });
        await openStaffRequest(id, travelers[0]);
      }
      await expect(detail.locator('[data-cr-form="start-execution"]')).toHaveCount(0);
      await staffAct(detail.locator("[data-cr-confirm-payment]"), "تم تأكيد استلام الدفع");

      // payment accepted = awaiting execution, on both sides; no service stage yet
      await openCustomerRequest(id);
      await bothSay(AWAITING);
      await expect(app.locator(".pay-state-ok")).toContainText("بانتظار بدء التنفيذ");
      await expect(app.locator("#requestProgress")).not.toContainText(journey.execution);

      // ---- staff: record the start of execution
      await openStaffRequest(id, travelers[0]);
      await office.fill("#cr-execution-note", "أُرسل للجهة المختصة");
      await staffAct(detail.locator('[data-cr-form="start-execution"] button[type="submit"]'), "تم تسجيل بدء التنفيذ");
      await openCustomerRequest(id);
      await bothSay(journey.execution);
      await expect(app.locator("#requestProgress")).not.toContainText("أُرسل للجهة المختصة");

      // ---- staff: final files per traveler. The first traveler's file alone
      // does not complete the group; the second one does (Egypt: after the
      // customer's travel plan, staff complete it).
      await openStaffRequest(id, travelers[0]);
      const travelerIds = (await (await office.request.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data.travelers.map((t: { id: string }) => t.id);
      await office.fill("#cr-deliverable-label", `الملف النهائي — ${travelers[0]}`);
      await office.locator("#cr-deliverable-file").setInputFiles({ name: "final-1.pdf", mimeType: "application/pdf", buffer: PDF });
      await office.locator(`[data-cr-form="deliverable"] input[name="travelerIds"][value="${travelerIds[0]}"]`).check();
      await expect(office.locator('[data-cr-form="deliverable"] input[name="publish"]')).toBeChecked();
      await staffAct(detail.locator('[data-cr-form="deliverable"] button[type="submit"]'), "تم رفع الملف ونشره");
      await expect(detail.locator("[data-cr-delivery-missing]")).toContainText(travelers[1]);
      await openCustomerRequest(id);
      await bothSay(journey.execution);
      await expect(app.locator(".deliverable-btn")).toHaveCount(1);

      // the second traveler's file: prepared as a draft (invisible), then published
      await openStaffRequest(id, travelers[0]);
      await office.fill("#cr-deliverable-label", `الملف النهائي — ${travelers[1]}`);
      await office.locator("#cr-deliverable-file").setInputFiles({ name: "final-2.pdf", mimeType: "application/pdf", buffer: PDF });
      await office.locator(`[data-cr-form="deliverable"] input[name="travelerIds"][value="${travelerIds[1]}"]`).check();
      await office.locator('[data-cr-form="deliverable"] input[name="publish"]').uncheck();
      await staffAct(detail.locator('[data-cr-form="deliverable"] button[type="submit"]'), "مسودة");
      await openCustomerRequest(id);
      await expect(app.locator(".deliverable-btn")).toHaveCount(1);
      await openStaffRequest(id, travelers[0]);
      await staffAct(detail.locator("[data-cr-publish]").first(), "تم نشر الملف");

      if (journey.travelPlan) {
        // refusal path: the approval is published, but the travel plan is owed
        await expect(office.locator("#cr-outcome option[value=COMPLETED]")).toBeDisabled();
        await expect(detail.locator("[data-cr-completion-blockers]")).toContainText("بيانات السفر والتعميم");
        const premature = await office.request.patch(`${BACKEND}/api/contact-requests/${id}/status`, { data: { status: "CLOSED", outcome: "COMPLETED" } });
        expect(premature.status()).toBe(409);
        expect(((await premature.json()).reasons as { code: string }[]).map((r) => r.code)).toContain("TRAVEL_PLAN_MISSING");
        await openCustomerRequest(id);
        await bothSay("ملفاتك النهائية جاهزة للتحميل");
        await expect(app.locator('#requestProgress [aria-current="step"]')).toHaveAttribute("aria-label", /بيانات السفر والتعميم — المرحلة الحالية/);
        await app.locator("#egyptTravelBtn").click();
        const entry = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
        // The AIR variant already fixed the entry method: shown, not asked again.
        await expect(app.locator("#egyptFixedEntryMode")).toContainText("جوي — مطار القاهرة");
        await expect(app.locator('#egyptPlanForm [name="entryMode"]')).toHaveCount(0);
        await app.locator('#egyptPlanForm [name="bookingStatus"]').selectOption("EXISTING");
        await app.fill('#egyptPlanForm [name="entryDate"]', entry);
        await app.locator('#egyptPlanForm [name="file"]').setInputFiles(png("ticket.png"));
        await app.locator("#egyptPlanForm button[type=submit]").click();
        await expect(app.locator("#egyptTravelSummary")).toContainText("جاهز لتجهيز التعميم", { timeout: 15_000 });
        // staff review the ticket, then complete the request by hand
        await openStaffRequest(id, travelers[0]);
        while ((await detail.locator("[data-doc-accept]").count()) > 0) {
          const before = await detail.locator("[data-doc-accept]").count();
          await detail.locator("[data-doc-accept]").first().click();
          await expect(detail.locator("[data-doc-accept]")).toHaveCount(before - 1, { timeout: 15_000 });
        }
        // the plan opened the circular task: still not completable until it is done
        await expect(office.locator("#cr-outcome option[value=COMPLETED]")).toBeDisabled();
        await expect(detail.locator("[data-cr-completion-blockers]")).toContainText("تجهيز تعميم الموافقة الأمنية لمصر");
        await staffAct(detail.locator("[data-cr-task-done]").first(), "تم إنجاز المهمة");
        await expect(detail.locator("[data-cr-completion-blockers]")).toHaveCount(0);
        await office.locator("#cr-outcome").selectOption("COMPLETED");
        await staffAct(detail.locator('[data-cr-form="close"] button[type="submit"]'), "تم إغلاق الطلب");
      }

      await openCustomerRequest(id);
      await bothSay("تم إنجاز طلبك بنجاح");
      await expect(app.locator(".deliverable-btn")).toHaveCount(2);
      await expect(app.locator("#requestProgress .progress-node-current")).toHaveCount(0);
      // closed: read-only for the customer and for staff
      await expect(app.locator("#approveBtn, #uploadReceiptBtn, #egyptTravelBtn, [data-upload-item]")).toHaveCount(0);
      await openStaffRequest(id, travelers[0]);
      await expect(detail.locator('[data-cr-form="deliverable"], [data-cr-form="close"], [data-doc-accept]')).toHaveCount(0);
    });
  }
});
