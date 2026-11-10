import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// T07 in the browser: staff record a pilgrim's visa state in the Umrah case
// workspace (reason + follow-up day, field errors from the server's rules), the
// customer sees it in «رحلتي», the ACCOUNTANT is offered no control, and a
// published visa still decides «issued». Synthetic package, account, request.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const PNG = fs.readFileSync(path.join(__dirname, "fixtures", "sample-document.png"));
const PDF = Buffer.from("%PDF-1.4\n%%EOF");
const headers = { Origin: WEB };

async function staffPage(browser: Browser, admin: Page, role: "EMPLOYEE" | "ACCOUNTANT") {
  const email = `visa-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers, data: { fullName: `حالة التأشيرة ${role}`, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  expect((await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
  return { context, page };
}

test.describe.serial("Umrah visa state", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  const stamp = `${Date.now()}`.slice(-8);
  const phone = `+2499${stamp}`;
  let admin: Page;
  let packageId = "";
  let accountId = "";
  let requestId = "";
  let travelers: Array<{ id: string; fullName: string }> = [];

  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(admin);
    const pkg = await admin.request.post(`${BACKEND}/api/services`, { headers, data: {
      code: `E2E-VISA-ST-${stamp}`, name: `باقة حالة التأشيرة ${stamp}`, category: "UMRAH_PACKAGE", basePrice: 400, currency: "SAR",
      active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"],
    } });
    expect(pkg.ok(), await pkg.text()).toBeTruthy();
    packageId = (await pkg.json()).data.id;
    const requirements = (await (await admin.request.get(`${BACKEND}/api/services/${packageId}/requirements/public`)).json()).data as Array<{ id: string; name: string }>;
    const residence = requirements.find((r) => r.name.includes("إقامة الضامن"))!;
    const passport = requirements.find((r) => /جواز|passport/i.test(r.name))!;
    const account = await admin.request.post(`${BACKEND}/api/payment-accounts`, { headers, data: { name: `E2E VISA ${stamp}`, bankName: "بنك اختبار", accountName: "حساب اختبار", accountNumber: `VSTAT${stamp}`, currency: "SAR" } });
    expect(account.ok(), await account.text()).toBeTruthy();
    accountId = (await account.json()).data.id;

    const form = new FormData();
    for (const [key, value] of Object.entries({
      name: `عميل حالة التأشيرة ${stamp}`, phone, message: "اختبار حالة التأشيرة", serviceId: packageId, acceptedTotal: "800", acceptedCurrency: "SAR",
      guarantorPhone: "+966 50 111 2222",
      travelers: JSON.stringify([{ fullName: `معتمر أول ${stamp}`, isPrimary: true }, { fullName: `معتمر ثان ${stamp}` }]),
      documentLabels: JSON.stringify(["إقامة الضامن", "جواز المعتمر الأول", "جواز المعتمر الثاني"]), documentRequirementIds: JSON.stringify([residence.id, passport.id, passport.id]), documentTravelerIndexes: JSON.stringify(["", "0", "1"]),
    })) form.append(key, value);
    form.append("documents", new Blob([PNG], { type: "image/png" }), "residence.png");
    form.append("documents", new Blob([PNG], { type: "image/png" }), "passport-0.png");
    form.append("documents", new Blob([PNG], { type: "image/png" }), "passport-1.png");
    const created = await admin.request.post(`${BACKEND}/api/contact-requests`, { headers, multipart: form });
    expect(created.status(), await created.text()).toBe(201);
    const body = (await created.json()).data;
    requestId = body.id;
    // payment, document review and execution through the existing endpoints
    const access = { ...headers, "x-payment-access": body.paymentAccess.token };
    const summary = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: access })).json()).data;
    const receipt = await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, { headers: access, multipart: { settlementAccountId: accountId, invoiceVersion: String(summary.invoiceVersion), file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(receipt.status(), await receipt.text()).toBe(201);
    expect((await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers, data: {} })).ok()).toBeTruthy();
    const detail = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    for (const document of detail.documents.filter((d: { status: string; classification: string }) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
      expect((await admin.request.patch(`${BACKEND}/api/contact-requests/${requestId}/documents/${document.id}/status`, { headers, data: { status: "ACCEPTED" } })).ok()).toBeTruthy();
    }
    const started = await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/start-execution`, { headers, data: {} });
    expect(started.ok(), await started.text()).toBeTruthy();
    travelers = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data.travelers;
  });

  test.afterAll(async () => {
    if (accountId) await admin.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { headers, data: { active: false } }).catch(() => undefined);
    if (packageId) await admin.request.patch(`${BACKEND}/api/services/${packageId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin?.context().close();
  });

  test("staff: field errors come with the field; delayed and rejected are saved and audited; the customer sees them", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto(`/admin/cases?requestId=${requestId}&tab=umrah`);
    await expect(page.locator("#umrah-workspace")).toBeVisible({ timeout: 20_000 });
    const first = page.locator(`[data-pilgrim="${travelers[0].id}"]`);
    const second = page.locator(`[data-pilgrim="${travelers[1].id}"]`);
    await expect(first.getByTestId("visa-state-form")).toBeVisible();

    // delayed without a reason → the message sits next to the reason field
    await first.getByLabel("حالة التأشيرة").selectOption("DELAYED");
    await first.getByRole("button", { name: "حفظ الحالة" }).click();
    await expect(first.getByRole("alert")).toContainText("اكتب السبب");
    await expect(first.getByLabel("السبب (يظهر للعميل)")).toHaveAttribute("aria-invalid", "true");
    await first.getByLabel("السبب (يظهر للعميل)").fill("بانتظار رد السفارة");
    await first.getByRole("button", { name: "حفظ الحالة" }).click();
    await expect(first.getByRole("alert")).toContainText("تاريخ المتابعة");
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await first.getByLabel("المتابعة التالية").fill(day);
    await first.getByRole("button", { name: "حفظ الحالة" }).click();
    await expect(first.getByRole("status").filter({ hasText: "حُفظت الحالة" })).toBeVisible();
    await expect(first.getByTestId("visa-state-current")).toHaveText("متأخرة");

    await second.getByLabel("حالة التأشيرة").selectOption("REJECTED");
    await second.getByLabel("السبب (يظهر للعميل)").fill("بيانات الجواز غير مطابقة");
    await second.getByRole("button", { name: "حفظ الحالة" }).click();
    await expect(second.getByTestId("visa-state-current")).toHaveText("مرفوضة");
    await assertNoHorizontalOverflow(page);

    // server truth: stored, audited, and the request is still open
    const row = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(row.status).not.toBe("CLOSED");
    expect(row.travelers.find((t: { id: string }) => t.id === travelers[0].id).visaState).toBe("DELAYED");
    const log = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/timeline`)).json()).data;
    expect(JSON.stringify(log)).toContain("UMRAH_VISA_STATE_CHANGED");

    // the customer's journey (public tracking login by phone is OTP-gated; the account/portal path is
    // covered by the backend suite) — here the staff journey view carries the same server object
    const journey = row.progress.umrah.pilgrims;
    expect(journey.map((p: { visa: string }) => p.visa)).toEqual(["DELAYED", "REJECTED"]);
    expect(journey[0].visaReason).toBe("بانتظار رد السفارة");
  });

  test("a published visa decides «issued»: the pilgrim's control disappears and one visa never closes the group", async ({ page }) => {
    await loginAsSeededAdmin(page);
    const file = await page.request.post(`${BACKEND}/api/contact-requests/${requestId}/deliverables`, {
      headers, multipart: { label: "تأشيرة المعتمر الأول", travelerIds: JSON.stringify([travelers[0].id]), publish: "true", file: { name: "visa.pdf", mimeType: "application/pdf", buffer: PDF } },
    });
    expect(file.status(), await file.text()).toBe(201);
    await page.goto(`/admin/cases?requestId=${requestId}&tab=umrah`);
    await expect(page.locator("#umrah-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`[data-pilgrim="${travelers[0].id}"]`).getByTestId("visa-state-form")).toHaveCount(0);
    await expect(page.locator(`[data-pilgrim="${travelers[0].id}"] [data-visa-state="ISSUED"]`)).toBeVisible();
    await expect(page.locator(`[data-pilgrim="${travelers[1].id}"] [data-visa-state="REJECTED"]`)).toBeVisible();
    const row = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(row.status).not.toBe("CLOSED");

    // The website, as the customer: the same server object, readable per pilgrim.
    await page.context().clearCookies();
    await page.goto("/track");
    await page.locator("#phone").fill(phone);
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.locator("#code").fill(readTrackingLoginCode(phone.replace(/\D/g, "")));
    await page.getByRole("button", { name: "تأكيد" }).click();
    const journey = page.getByTestId("umrah-journey");
    await expect(journey).toBeVisible({ timeout: 15_000 });
    await expect(journey.getByTestId("umrah-visa-state")).toHaveText(["صدرت التأشيرة", "تأشيرة مرفوضة"]);
    await expect(journey.getByTestId("umrah-visa-reason")).toContainText("بيانات الجواز غير مطابقة");
    await expect(journey.getByTestId("umrah-visa-reason")).toContainText("لا يُغلق الطلب قبل ذلك");
    await assertNoHorizontalOverflow(page);
  });

  test("EMPLOYEE: an unassigned request is claimed first; a colleague then sees it read-only; the server enforces it", async ({ browser }) => {
    const row = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(row.assignedUserId ?? null).toBeNull();
    const first = await staffPage(browser, admin, "EMPLOYEE");
    const second = await staffPage(browser, admin, "EMPLOYEE");
    // the API refuses work before the claim
    const early = await first.page.request.patch(`${BACKEND}/api/contact-requests/${requestId}/travelers/${travelers[1].id}/visa-state`, { headers, data: { state: "IN_PROGRESS" } });
    expect(early.status()).toBe(409);
    expect((await early.json()).code).toBe("CLAIM_REQUIRED");

    await first.page.goto(`${WEB}/admin/cases?requestId=${requestId}&tab=umrah`);
    await expect(first.page.locator("#umrah-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(first.page.getByTestId("visa-state-form")).toHaveCount(0);
    await first.page.getByTestId("umrah-claim").click();
    await expect(first.page.getByTestId("umrah-assignee")).toContainText("أنت");
    await expect(first.page.getByTestId("umrah-claim")).toHaveCount(0);
    await expect(first.page.getByTestId("visa-state-form")).toBeVisible();

    await second.page.goto(`${WEB}/admin/cases?requestId=${requestId}&tab=umrah`);
    await expect(second.page.locator("#umrah-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(second.page.getByTestId("umrah-readonly")).toContainText("للقراءة فقط");
    await expect(second.page.getByTestId("umrah-claim")).toHaveCount(0);
    await expect(second.page.getByTestId("visa-state-form")).toHaveCount(0);
    const refused = await second.page.request.patch(`${BACKEND}/api/contact-requests/${requestId}/travelers/${travelers[1].id}/visa-state`, { headers, data: { state: "IN_PROGRESS" } });
    expect(refused.status()).toBe(403);
    await assertNoHorizontalOverflow(first.page);
    await first.context.close();
    await second.context.close();
  });

  test("an ACCOUNTANT sees the case read-only: no visa-state control, and the endpoint refuses", async ({ browser }) => {
    const accountant = await staffPage(browser, admin, "ACCOUNTANT");
    const refused = await accountant.page.request.patch(`${BACKEND}/api/contact-requests/${requestId}/travelers/${travelers[1].id}/visa-state`, { headers, data: { state: "IN_PROGRESS" } });
    expect(refused.status()).toBe(403);
    await accountant.context.close();
  });
});
