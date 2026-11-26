import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// One two-pilgrim visa-only request on the website, signed in, one reference
// throughout: the second passport upload is cut off, the form is resumed after
// a reload (the first passport kept), the submission's answer is lost and it
// is sent again (still one request), the receipt is paid, only passport 2 is
// corrected from the notification, then one visa is issued. Customer, employee
// and manager each see the next action; the customer downloads the visa beside
// the right pilgrim. Synthetic package, account, people and files.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const FIXTURE = path.join(__dirname, "fixtures", "sample-document.png");
const PNG = fs.readFileSync(FIXTURE);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const headers = { Origin: WEB };

async function staffPage(browser: Browser, admin: Page, role: "EMPLOYEE") {
  const email = `recovery-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers, data: { fullName: `موظف عمليات ${Date.now()}`, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  expect((await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
  return { context, page };
}

test("two pilgrims: interrupted upload, resume, lost answer and retry, targeted correction, one visa — one reference, every file kept", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const stamp = `${Date.now()}`.slice(-8);
  const phone = `+2499${stamp}`;
  const customer = `عميل استئناف ${stamp}`;
  const names = [`المعتمر الأول ${stamp}`, `المعتمر الثاني ${stamp}`];
  const admin = await (await browser.newContext()).newPage();
  await loginAsSeededAdmin(admin);
  const code = `E2E-RECOVERY-${stamp}`;
  const packageName = `تأشيرة عمرة استئناف ${stamp}`;
  const pkg = await admin.request.post(`${BACKEND}/api/services`, { headers, data: {
    code, name: packageName, category: "UMRAH_PACKAGE", basePrice: 700, currency: "SAR",
    active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY", "INCLUDED: إصدار تأشيرة العمرة"],
  } });
  expect(pkg.ok(), await pkg.text()).toBeTruthy();
  const packageId = (await pkg.json()).data.id;
  const accountNumber = `RCV${stamp}`;
  const account = await admin.request.post(`${BACKEND}/api/payment-accounts`, { headers, data: { name: `E2E RECOVERY ${stamp}`, bankName: "بنك الاستئناف للاختبار", accountName: "حساب اختبار", accountNumber, currency: "SAR" } });
  expect(account.ok(), await account.text()).toBeTruthy();
  const accountId = (await account.json()).data.id;
  const requestsFor = async () => (await (await admin.request.get(`${BACKEND}/api/contact-requests?serviceKind=UMRAH&search=${encodeURIComponent(phone.replace(/\D/g, "").slice(-9))}`)).json()).data as Array<{ id: string }>;

  try {
    // ---- the customer signs up on the website, then applies
    await page.goto("/account/register");
    await page.locator("#fullName").fill(customer);
    await page.locator("#phone").fill(phone);
    await page.locator("#password").fill("Test@12345");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });

    await page.goto(`/umrah?package=${code}`);
    await expect(page.getByTestId("wizard-step-label")).toHaveText("الخطوة 1 من 3: اختيار الباقة", { timeout: 15_000 });
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByTestId("wizard-step-label")).toHaveText("الخطوة 2 من 3: المعتمرون والضامن");
    await page.locator('input[type="number"]').fill("2");
    await page.getByPlaceholder("اسمك الكامل").fill(customer);
    await page.getByPlaceholder("+249 9XX XXX XXX").fill(phone);
    await page.getByTestId("umrah-guarantor-phone").fill("+966 50 444 5555");
    await page.getByPlaceholder("اسم المسافر 1").fill(names[0]);
    await page.getByPlaceholder("اسم المسافر 2").fill(names[1]);

    // Passport 1 uploads; passport 2 is cut off before it reaches the server.
    let posts = 0;
    await page.route("**/api/intake-drafts/current/documents", async (route) => {
      if (route.request().method() === "POST" && ++posts === 2) await route.abort("internetdisconnected");
      else await route.continue();
    });
    const pick = () => page.locator('label:has-text("اختر ملفًا") input[type="file"]').first();
    await pick().setInputFiles(FIXTURE);
    await expect(page.locator('[data-testid="draft-doc"][data-status="uploaded"]')).toHaveCount(1, { timeout: 15_000 });
    await pick().setInputFiles(FIXTURE);
    const failed = page.locator('[data-testid="draft-doc"][data-status="error"]');
    await expect(failed).toHaveCount(1, { timeout: 15_000 });
    // A clear Arabic recovery instruction, and a retry beside the file.
    await expect(failed.getByRole("alert")).toHaveText("انقطع الاتصال أثناء رفع هذا الملف. ما رفعته قبله محفوظ؛ اضغط «إعادة المحاولة» عند عودة الاتصال.");
    await expect(failed.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
    await page.unroute("**/api/intake-drafts/current/documents");
    const firstUploadId = await page.locator('[data-testid="draft-doc"][data-status="uploaded"]').getAttribute("data-document-id");

    // The customer leaves and comes back: the form resumes, passport 1 kept.
    await page.reload();
    await page.getByRole("button", { name: "متابعة الطلب", exact: true }).click();
    await expect(page.locator('[data-testid="draft-doc"][data-status="uploaded"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('[data-testid="draft-doc"][data-status="uploaded"]')).toHaveAttribute("data-document-id", firstUploadId!);
    await expect(page.getByPlaceholder("اسم المسافر 2")).toHaveValue(names[1]);
    await expect(page.getByRole("button", { name: "التالي" })).toBeDisabled();
    // Passport 2 again, then the guarantor's residence.
    for (let i = 0; i < 2; i += 1) {
      await pick().setInputFiles(FIXTURE);
      await expect(page.locator('[data-testid="draft-doc"][data-status="uploaded"]')).toHaveCount(2 + i, { timeout: 15_000 });
    }
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByTestId("wizard-step-label")).toHaveText("الخطوة 3 من 3: المراجعة والإرسال");
    await expect(page.getByTestId("fixed-total")).toHaveText("1,400 SAR");
    await page.getByTestId("confirm-fixed-total").check();

    // The submission reaches the server but its answer is lost; sent again.
    let lost = false;
    const submitUrl = /\/api\/(contact-requests|intake-drafts\/current\/submit)$/;
    await page.route(submitUrl, async (route) => {
      if (!lost && route.request().method() === "POST") {
        lost = true;
        await route.fetch();
        await route.abort("connectionreset");
      } else await route.continue();
    });
    const send = page.getByRole("button", { name: "تأكيد ومتابعة إلى الدفع" });
    await send.click();
    await expect(page.getByText("انقطع الاتصال قبل وصول الرد. تحقق من الإنترنت ثم أعد المحاولة؛ لن يُرسل طلبك مرتين.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await requestsFor()).length, { timeout: 15_000 }).toBe(1);
    const retried = page.waitForResponse((r) => submitUrl.test(new URL(r.url()).pathname) && r.request().method() === "POST");
    await send.click();
    expect([200, 201]).toContain((await retried).status());
    await page.unroute(submitUrl);
    const found = await requestsFor();
    expect(found, "a retry after a lost answer is the same request").toHaveLength(1);
    const requestId = found[0].id;

    // Payment: the receipt.
    const step = page.getByTestId("payment-step");
    await expect(step.getByTestId("payment-amount")).toHaveText("1,400 SAR", { timeout: 15_000 });
    await step.getByTestId("payment-account").filter({ hasText: accountNumber }).getByRole("radio").check();
    await step.getByTestId("payment-receipt-input").setInputFiles(FIXTURE);
    const receiptSent = page.waitForResponse((r) => r.url().includes("/payment-access/receipt"));
    await step.getByRole("button", { name: "إرسال الطلب للمراجعة" }).click();
    expect((await receiptSent).status()).toBe(201);

    type Doc = { id: string; requirementId: string | null; travelerId: string | null; classification: string | null; supersededAt: string | null; status: string; label: string };
    const detailOf = async () => (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    const before = await detailOf();
    expect(before.customer, "linked to the signed-in account").toBeTruthy();
    expect(before.travelers.map((t: { fullName: string }) => t.fullName)).toEqual(names);
    const [p1, p2] = before.travelers as Array<{ id: string; fullName: string }>;
    const docs = before.documents as Doc[];
    const passport1 = docs.find((d) => d.travelerId === p1.id)!;
    const passport2 = docs.find((d) => d.travelerId === p2.id)!;
    const receipt = docs.find((d) => d.classification === "FINANCIAL_DOCUMENT")!;
    expect(passport1 && passport2 && receipt, JSON.stringify(docs.map((d) => [d.label, d.travelerId]))).toBeTruthy();
    expect(docs.filter((d) => !d.supersededAt && d.classification !== "FINANCIAL_DOCUMENT"), "two passports and the residence, nothing duplicated").toHaveLength(3);

    // ---- staff: passport 2 needs a correction
    const rejected = await admin.request.patch(`${BACKEND}/api/contact-requests/${requestId}/documents/${passport2.id}/status`, { headers, data: { status: "REJECTED", reviewNote: "صورة الجواز غير واضحة" } });
    expect(rejected.ok(), await rejected.text()).toBeTruthy();

    // ---- customer: the notification opens passport 2, replaced alone
    await page.goto("/account");
    await page.getByRole("tab", { name: "الإشعارات" }).click();
    await page.locator('[data-notification-type="CONTACT_REQUEST_DOCUMENT_REJECTED"]').first().click();
    const row = page.locator(`[data-checklist-row="${passport2.requirementId}::${p2.id}"]`);
    await expect(row).toHaveAttribute("data-state", "REJECTED", { timeout: 15_000 });
    await expect(row).toContainText("السبب: صورة الجواز غير واضحة");
    // The account's journey asks for exactly that: the documents.
    await expect(page.getByTestId("umrah-action")).toHaveText("استكمال المستندات");
    const replaced = page.waitForResponse((r) => r.url().endsWith(`/api/customer/requests/${requestId}/documents`) && r.request().method() === "POST");
    await row.locator('input[type="file"]').setInputFiles({ name: "passport-2-new.png", mimeType: "image/png", buffer: PNG });
    expect((await replaced).status()).toBe(201);
    await expect(row).toHaveAttribute("data-state", "UNDER_REVIEW", { timeout: 15_000 });

    const corrected = await detailOf();
    expect(corrected.id).toBe(requestId);
    const current = (corrected.documents as Doc[]).filter((d) => !d.supersededAt);
    expect(current.some((d) => d.id === passport1.id), "passport 1 kept").toBe(true);
    expect(current.some((d) => d.id === receipt.id), "the receipt kept").toBe(true);
    expect(current.some((d) => d.id === passport2.id), "the rejected passport 2 replaced").toBe(false);
    expect(current).toHaveLength(docs.filter((d) => !d.supersededAt).length);

    // ---- staff: documents accepted, payment confirmed, execution started
    for (const d of current.filter((d) => d.classification !== "FINANCIAL_DOCUMENT" && d.status !== "ACCEPTED")) {
      expect((await admin.request.patch(`${BACKEND}/api/contact-requests/${requestId}/documents/${d.id}/status`, { headers, data: { status: "ACCEPTED" } })).ok()).toBeTruthy();
    }
    expect((await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers, data: {} })).ok()).toBeTruthy();

    // The employee claims it and sees the next action in the queue.
    const employee = await staffPage(browser, admin, "EMPLOYEE");
    expect((await employee.page.request.post(`${BACKEND}/api/contact-requests/${requestId}/claim`, { headers, data: {} })).ok()).toBeTruthy();
    expect((await employee.page.request.post(`${BACKEND}/api/contact-requests/${requestId}/start-execution`, { headers, data: {} })).ok()).toBeTruthy();

    // One visa, published by the employee after confirming file and pilgrim.
    await employee.page.goto(`/admin/cases?requestId=${requestId}`);
    await employee.page.getByRole("button", { name: "سير العمل" }).click();
    const workflow = employee.page.getByTestId("case-workflow");
    const form = workflow.getByTestId("workflow-deliverable");
    await form.locator('input[name="label"]').fill(`تأشيرة ${names[0]}`, { timeout: 20_000 });
    await form.locator('input[name="file"]').setInputFiles({ name: "visa.pdf", mimeType: "application/pdf", buffer: PDF });
    await form.locator(`input[name="travelerIds"][value="${p1.id}"]`).check();
    await form.getByRole("button", { name: "رفع" }).click();
    await expect(workflow.getByTestId("publish-confirm-travelers")).toHaveText(`يخص: ${names[0]}`);
    await expect(workflow.getByTestId("publish-confirm-partial")).toHaveText(`بعد النشر: تبقى تأشيرة ${names[1]}؛ يبقى الطلب مفتوحًا.`);
    await workflow.getByTestId("publish-confirm-submit").click();
    await expect(workflow.getByRole("status")).toContainText("تم نشر الملف للعميل");

    await employee.page.goto("/admin/umrah");
    await employee.page.getByLabel("بحث", { exact: true }).fill(phone);
    const queueRow = employee.page.locator(`[data-umrah-id="${requestId}"]`);
    await expect(queueRow.locator("[data-umrah-next]")).toHaveText("رفع الملفات النهائية لكل معتمر", { timeout: 15_000 });
    await employee.context.close();

    // The manager: one partially issued case, opened from its count.
    await admin.goto("/admin/umrah");
    await admin.getByLabel("بحث", { exact: true }).fill(phone);
    await expect(admin.locator('[data-umrah-alert="PARTIAL_VISAS"] [data-umrah-count]')).toHaveText("1", { timeout: 15_000 });
    await admin.locator('[data-umrah-alert="PARTIAL_VISAS"]').click();
    await expect(admin.locator(`[data-umrah-id="${requestId}"]`)).toBeVisible();
    await expect(admin.locator("[data-umrah-id]")).toHaveCount(1);

    // ---- customer: one of two issued, the visa beside pilgrim 1, the next step said
    await page.goto("/account");
    await page.getByRole("tab", { name: "طلباتي العامة" }).click();
    await page.getByRole("button").filter({ hasText: requestId }).first().click();
    const journey = page.getByTestId("umrah-journey");
    await expect(journey).toBeVisible({ timeout: 15_000 });
    await expect(journey.getByTestId("umrah-reference")).toHaveText(requestId);
    await expect(journey.getByTestId("umrah-visa-count")).toHaveText("صدرت تأشيرة واحدة من أصل تأشيرتين.");
    const pilgrims = journey.getByTestId("umrah-pilgrim");
    await expect(pilgrims.nth(0)).toContainText(names[0]);
    await expect(pilgrims.nth(0).getByTestId("umrah-visa-state")).toHaveText("صدرت التأشيرة");
    await expect(pilgrims.nth(1).getByTestId("umrah-visa-state")).not.toHaveText("صدرت التأشيرة");
    await expect(pilgrims.nth(1).getByTestId("umrah-file")).toHaveCount(0);
    await expect(journey.getByTestId("umrah-now-message")).not.toBeEmpty();
    await expect(journey.getByTestId("umrah-action")).toHaveText("تحميل التأشيرة");
    const href = await pilgrims.nth(0).getByTestId("umrah-file").getAttribute("href");
    expect(href).toContain(`/customer/requests/${requestId}/deliverables/`);
    const download = await page.request.get(href!);
    expect(download.status(), "the customer downloads pilgrim 1's visa from the account").toBe(200);
    expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const final = await detailOf();
    expect(final.id).toBe(requestId);
    expect(final.status).not.toBe("CLOSED");
    expect((await requestsFor()).length, "still one request").toBe(1);
  } finally {
    await admin.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin.request.patch(`${BACKEND}/api/services/${packageId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin.context().close();
  }
});
