import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

// Umrah Case Workspace (design system Phase 4): /admin/umrah and the «العمرة»
// tab of /admin/cases, against the real backend. The package, its price and
// the payment account are test fixtures (deactivated afterwards); the request
// is submitted through the public API exactly as the website submits it, and
// every transition below is an existing endpoint, not something this UI adds.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const PNG = fs.readFileSync(path.join(__dirname, "fixtures", "sample-document.png"));
const PDF = Buffer.from("%PDF-1.4\n%%EOF");

async function staffPage(browser: Browser, admin: Page, role: "EMPLOYEE" | "ACCOUNTANT") {
  const email = `umrah-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers: { Origin: WEB }, data: { fullName: `اختبار العمرة ${role}`, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  expect((await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
  return { context, page };
}

test.describe.serial("Umrah Case Workspace", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  const stamp = `${Date.now()}`.slice(-8);
  const customer = `معتمر مساحة العمل ${stamp}`;
  const phone = `0915${stamp.slice(-6)}`;
  const preferredDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  let admin: Page;
  let packageId = "";
  let accountId = "";
  let requestId = "";
  let paymentToken = "";

  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(admin);
    const headers = { Origin: WEB };
    const pkg = await admin.request.post(`${BACKEND}/api/services`, { headers, data: {
      code: `E2E-UMRAH-WS-${stamp}`, name: `باقة عمرة مساحة العمل ${stamp}`, category: "UMRAH_PACKAGE", basePrice: 1250, currency: "SAR",
      active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: AIR", "INCLUDED: التأشيرة والطيران"],
    } });
    expect(pkg.ok(), await pkg.text()).toBeTruthy();
    packageId = (await pkg.json()).data.id;
    const passport = await admin.request.post(`${BACKEND}/api/services/${packageId}/requirements`, { headers, data: { name: "صورة الجواز ساري المفعول", scope: "TRAVELER", type: "DOCUMENT", required: true } });
    expect(passport.ok(), await passport.text()).toBeTruthy();
    const requirements = (await (await admin.request.get(`${BACKEND}/api/services/${packageId}/requirements/public`)).json()).data as Array<{ id: string; name: string }>;
    const residence = requirements.find((r) => r.name.includes("إقامة الضامن"))!;
    const passportReq = requirements.find((r) => r.name.includes("الجواز"))!;
    const account = await admin.request.post(`${BACKEND}/api/payment-accounts`, { headers, data: { name: `E2E UMRAH WS ${stamp}`, bankName: "بنك اختبار العمرة", accountName: "حساب اختبار", accountNumber: `UMRWS${stamp}`, currency: "SAR" } });
    expect(account.ok(), await account.text()).toBeTruthy();
    accountId = (await account.json()).data.id;

    // The public submission, as the website sends it.
    const form = new FormData();
    for (const [key, value] of Object.entries({
      name: customer, phone, message: "طلب عمرة لاختبار مساحة العمل", serviceId: packageId, acceptedTotal: "1250", acceptedCurrency: "SAR",
      guarantorPhone: "+966 50 765 4321", preferredTravelDate: preferredDate,
      travelers: JSON.stringify([{ fullName: `${customer} — المعتمر`, passportNo: "P7654321", isPrimary: true }]),
      documentLabels: JSON.stringify(["صورة الجواز ساري المفعول", "إقامة الضامن"]),
      documentRequirementIds: JSON.stringify([passportReq.id, residence.id]),
      documentTravelerIndexes: JSON.stringify(["0", ""]),
    })) form.append(key, value);
    form.append("documents", new Blob([PNG], { type: "image/png" }), "passport.png");
    form.append("documents", new Blob([PNG], { type: "image/png" }), "residence.png");
    const created = await admin.request.post(`${BACKEND}/api/contact-requests`, { headers, multipart: form });
    expect(created.status(), await created.text()).toBe(201);
    const body = (await created.json()).data;
    requestId = body.id;
    paymentToken = body.paymentAccess.token;
  });

  test.afterAll(async () => {
    const headers = { Origin: WEB };
    if (accountId) await admin.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { headers, data: { active: false } }).catch(() => undefined);
    if (packageId) await admin.request.patch(`${BACKEND}/api/services/${packageId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin?.context().close();
  });

  const serverRow = async (page: Page) => {
    const list = (await (await page.request.get(`${BACKEND}/api/contact-requests?serviceKind=UMRAH&search=${encodeURIComponent(phone)}`)).json()).data;
    return list.find((r: { id: string }) => r.id === requestId);
  };

  test("queue: server stage and next step, package type, filters; a row opens the «العمرة» tab", async ({ page }) => {
    await loginAsSeededAdmin(page);
    const failures: string[] = [];
    page.on("response", (r) => { if (r.url().startsWith(`${BACKEND}/api/`) && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
    await page.goto("/admin/umrah");
    await expect(page.getByRole("heading", { name: "طلبات العمرة", level: 1 })).toBeVisible();
    const rail = page.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(rail.getByRole("link", { name: "طلبات العمرة" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "المجموعات والباقات" })).toBeVisible();

    await page.getByLabel("بحث", { exact: true }).fill(phone);
    const row = page.locator(`[data-umrah-id="${requestId}"]`);
    await expect(row).toBeVisible();
    await expect(page.locator("[data-umrah-id]")).toHaveCount(1);
    const server = await serverRow(page);
    await expect(row.locator("[data-umrah-next]")).toHaveText(server.umrahQueue.nextAction);
    await expect(row.locator("[data-umrah-stage]")).toHaveAttribute("data-umrah-stage", server.progress.stage);
    await expect(row).toContainText("مع خدمات الطيران");
    await expect(row).toContainText(preferredDate);
    await expect(row).toContainText("1,250 SAR");

    // Server filters and within-page filters.
    await page.getByLabel("الدفع", { exact: true }).selectOption("CONFIRMED");
    await expect(page.getByText("لا توجد طلبات مطابقة.")).toBeVisible();
    await page.getByLabel("الدفع", { exact: true }).selectOption("AWAITING_TRANSFER");
    await expect(row).toBeVisible();
    await page.getByLabel("نوع الباقة").selectOption("SEA");
    await expect(page.getByText("لا توجد طلبات مطابقة.")).toBeVisible();
    await page.getByLabel("نوع الباقة").selectOption("AIR");
    await expect(row).toBeVisible();
    await page.getByLabel("الموظف المسؤول").selectOption("unassigned");
    await expect(row).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/admin/cases\\?requestId=${requestId}&tab=umrah`));
    const ws = page.locator("#umrah-workspace");
    await expect(ws).toBeVisible({ timeout: 20_000 });
    await expect(ws.locator("[data-umrah-next]")).toHaveText(server.umrahQueue.nextAction);
    await expect(page.getByTestId("umrah-kind")).toHaveText("مع خدمات الطيران");
    // The server's steps, in its order and state.
    const steps = ws.locator("[data-step]");
    await expect(steps).toHaveCount(server.progress.steps.length);
    for (const [index, step] of (server.progress.steps as Array<{ key: string; state: string }>).entries()) {
      await expect(steps.nth(index)).toHaveAttribute("data-state", step.state);
    }
    // Guarantor (phone + residence with its review status) and the pilgrim's passport.
    await expect(page.getByTestId("umrah-guarantor")).toContainText("+966 50 765 4321");
    await expect(page.getByTestId("umrah-guarantor")).toContainText("بانتظار المراجعة");
    await expect(page.getByTestId("umrah-pilgrims")).toContainText("صورة الجواز ساري المفعول");
    expect(failures).toEqual([]);
  });

  test("the existing workflow end to end: receipt → payment review → documents → execution → final file → closed, with its log", async ({ page, browser }) => {
    // Customer uploads the receipt through the payment link, against the invoice version it shows.
    const access = { Origin: WEB, "x-payment-access": paymentToken };
    const summary = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: access })).json()).data;
    const receipt = await page.request.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, {
      headers: access,
      multipart: { settlementAccountId: accountId, invoiceVersion: String(summary.invoiceVersion), file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF } },
    });
    expect(receipt.status(), await receipt.text()).toBe(201);

    await loginAsSeededAdmin(page);
    await page.goto("/admin/umrah");
    await page.getByLabel("بحث", { exact: true }).fill(phone);
    const row = page.locator(`[data-umrah-id="${requestId}"]`);
    await expect(row.locator("[data-umrah-next]")).toHaveText("مراجعة إيصال الدفع وتأكيده");
    await expect(page.locator('[data-umrah-alert="PAYMENT_REVIEW"]')).toContainText("1");

    // Payment is accepted by an ACCOUNTANT (the payment-review role), never from this page.
    const accountant = await staffPage(browser, admin, "ACCOUNTANT");
    const confirmed = await accountant.page.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers: { Origin: WEB }, data: {} });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    await accountant.context.close();

    // Staff review the documents from the «العمرة» tab's shortcut.
    await page.goto(`/admin/cases?requestId=${requestId}&tab=umrah`);
    await expect(page.locator("#umrah-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("umrah-payment")).toContainText("مؤكد");
    await expect(page.locator("[data-umrah-next]")).toHaveText("مراجعة مستندات المعتمرين");
    await page.getByRole("button", { name: "مراجعة المستندات" }).click();
    for (const label of ["صورة الجواز ساري المفعول", "إقامة الضامن"]) {
      const item = page.locator("li").filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.getByRole("button", { name: "قبول", exact: true }) });
      await item.getByRole("button", { name: "قبول", exact: true }).click();
      await expect(item).toContainText("مقبول", { timeout: 15_000 });
    }
    await page.getByRole("button", { name: "العمرة", exact: true }).click();
    await expect(page.getByTestId("umrah-guarantor")).toContainText("مقبول");
    await expect(page.locator("[data-umrah-next]")).toContainText("بدء");

    // Execution and the pilgrim's final file through the existing endpoints → the server closes it.
    const started = await page.request.post(`${BACKEND}/api/contact-requests/${requestId}/start-execution`, { headers: { Origin: WEB }, data: {} });
    expect(started.ok(), await started.text()).toBeTruthy();
    const detail = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    const traveler = detail.travelers[0];
    const file = await page.request.post(`${BACKEND}/api/contact-requests/${requestId}/deliverables`, {
      headers: { Origin: WEB },
      multipart: { label: `التأشيرة — ${traveler.fullName}`, travelerIds: JSON.stringify([traveler.id]), publish: "true", file: { name: "visa.pdf", mimeType: "application/pdf", buffer: PDF } },
    });
    expect(file.ok(), await file.text()).toBeTruthy();

    await page.reload();
    await expect(page.locator("#umrah-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("umrah-stage")).toHaveText("مغلق");
    await expect(page.getByTestId("umrah-pilgrims")).toContainText("الملف النهائي منشور");
    await expect(page.locator('[data-step][data-state="upcoming"], [data-step][data-state="current"]')).toHaveCount(0);

    // Every transition is in the case's audit log with who did it.
    const timeline = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/timeline`)).json()).data as Array<{ action: string; user: { role: string } | null }>;
    const actions = timeline.map((entry) => entry.action);
    for (const action of ["CONTACT_REQUEST_EXECUTION_STARTED"]) expect(actions).toContain(action);
    expect(timeline.some((entry) => entry.user?.role === "ACCOUNTANT"), "payment confirmation is logged with the accountant").toBe(true);
    expect(actions.length).toBeGreaterThanOrEqual(5);
  });

  test("roles: EMPLOYEE works requests; ACCOUNTANT reads the list only and the server refuses its workflow actions", async ({ browser }) => {
    const employee = await staffPage(browser, admin, "EMPLOYEE");
    await employee.page.goto(`${WEB}/admin/umrah`);
    await employee.page.getByLabel("بحث", { exact: true }).fill(phone);
    await expect(employee.page.locator(`a[data-umrah-id="${requestId}"]`)).toBeVisible();
    await expect(employee.page.getByRole("link", { name: "المجموعات والباقات" })).toBeVisible();
    await employee.context.close();

    const accountant = await staffPage(browser, admin, "ACCOUNTANT");
    const page = accountant.page;
    await page.goto(`${WEB}/admin/umrah`);
    const rail = page.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(rail.getByRole("link", { name: "طلبات العمرة" })).toBeVisible();
    await expect(rail.getByRole("link", { name: "مجموعات العمرة" })).toHaveCount(0);
    await expect(page.getByText("عرض للاطلاع فقط")).toBeVisible();
    await page.getByLabel("بحث", { exact: true }).fill(phone);
    await expect(page.locator(`[data-umrah-id="${requestId}"]`)).toBeVisible();
    await expect(page.locator(`a[data-umrah-id="${requestId}"]`)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "المجموعات والباقات" })).toHaveCount(0);
    for (const [method, url] of [["post", "start-execution"], ["patch", "status"], ["get", "timeline"]] as const) {
      const res = await page.request[method](`${BACKEND}/api/contact-requests/${requestId}/${url}`, { headers: { Origin: WEB }, ...(method === "get" ? {} : { data: { status: "CONTACTED" } }) });
      expect(res.status(), url).toBe(403);
    }
    await accountant.context.close();
  });
});
