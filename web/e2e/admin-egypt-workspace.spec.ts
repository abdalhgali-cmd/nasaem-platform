import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

// Egypt Case Workspace (design system Phase 3): /admin/egypt and the
// «الموافقة الأمنية» tab of /admin/cases, against the real backend. The
// request is created the way the website creates one (intake draft → passport
// → submit at the configured fixed price); the price is a test fixture and the
// variant is restored to inactive/unpriced afterwards.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const AIR = "VISA-EGYPT-CLEARANCE-AIR";
const PASSPORT = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

function khartoumDay(offsetDays = 0) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

async function createAirRequest(api: APIRequestContext, visaTypeId: string, name: string, phone: string) {
  const headers = { Origin: WEB };
  const requirements = (await (await api.get(`${BACKEND}/api/visa-types/${visaTypeId}/requirements/public`)).json()).data as Array<{ id: string; attachmentType?: string }>;
  const passport = requirements.find((r) => r.attachmentType === "passport_copy");
  expect(passport, "AIR variant has a passport requirement").toBeTruthy();
  const draft = await api.post(`${BACKEND}/api/intake-drafts`, { headers, data: { serviceKind: "visa", visaTypeId } });
  expect(draft.ok(), await draft.text()).toBeTruthy();
  const token = (await draft.json()).data.token as string;
  const traveler = { fullName: name, passportNo: "P1234567", birthDate: "1990-01-01", isPrimary: true };
  const saved = await api.patch(`${BACKEND}/api/intake-drafts/${token}`, { headers, data: { serviceKind: "visa", visaTypeId, step: 0, name, phone, travelerCount: 1, travelers: [traveler] } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const uploaded = await api.post(`${BACKEND}/api/intake-drafts/${token}/documents`, {
    headers,
    multipart: { label: "صورة جواز السفر", requirementId: passport!.id, travelerIndex: "0", file: { name: "passport.png", mimeType: "image/png", buffer: fs.readFileSync(PASSPORT) } },
  });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  const submitted = await api.post(`${BACKEND}/api/intake-drafts/${token}/submit`, {
    headers,
    data: { message: "Egypt workspace e2e", acceptedTotal: "95.00", acceptedCurrency: "USD", departureCity: "بورتسودان", arrivalAirport: "القاهرة" },
  });
  expect(submitted.ok(), await submitted.text()).toBeTruthy();
  return (await submitted.json()).data.id as string;
}

async function staffPage(browser: Browser, admin: Page, role: "EMPLOYEE" | "ACCOUNTANT") {
  const email = `egypt-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers: { Origin: WEB }, data: { fullName: `اختبار الموافقة الأمنية ${role}`, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  expect((await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
  return { context, page };
}

test.describe.serial("Egypt Case Workspace", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  let admin: Page;
  let visaTypeId = "";
  let requestId = "";
  const phone = `0912${String(Date.now()).slice(-6)}`;
  const name = `EGYPT-WS ${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(admin);
    const visas = (await (await admin.request.get(`${BACKEND}/api/visa-types?limit=200`)).json()).data as Array<{ id: string; code: string }>;
    visaTypeId = visas.find((v) => v.code === AIR)?.id || "";
    expect(visaTypeId, "the seed creates the AIR variant").toBeTruthy();
    const priced = await admin.request.patch(`${BACKEND}/api/visa-types/${visaTypeId}`, { headers: { Origin: WEB }, data: { pricingMode: "FIXED", basePrice: 95, currency: "USD", priceUnit: "PER_TRAVELER", active: true } });
    expect(priced.ok(), await priced.text()).toBeTruthy();
    requestId = await createAirRequest(admin.request, visaTypeId, name, phone);
  });

  test.afterAll(async () => {
    if (visaTypeId) await admin.request.patch(`${BACKEND}/api/visa-types/${visaTypeId}`, { headers: { Origin: WEB }, data: { pricingMode: "QUOTE", active: false } }).catch(() => undefined);
    await admin?.context().close();
  });

  test("queue: server stages, filters and search; a row opens its Egypt workspace", async ({ page }) => {
    await loginAsSeededAdmin(page);
    const failures: string[] = [];
    page.on("response", (r) => { if (r.url().startsWith(`${BACKEND}/api/`) && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });

    await page.goto("/admin/egypt");
    await expect(page.getByRole("heading", { name: "الموافقة الأمنية لمصر", level: 1 })).toBeVisible();
    const rail = page.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(rail.getByRole("link", { name: "الموافقة الأمنية لمصر" })).toHaveAttribute("aria-current", "page");

    // Filters: view, stage, operational filter, assignee, entry, travel from/to, search.
    await expect(page.getByLabel("العرض", { exact: true })).toHaveValue("schedule");
    await expect(page.getByLabel("المرحلة", { exact: true }).locator("option")).not.toHaveCount(1);
    for (const control of ["تصفية تشغيلية", "الموظف المسؤول", "طريقة الدخول", "السفر من", "السفر إلى"]) await expect(page.getByLabel(control)).toBeVisible();

    await page.getByLabel("بحث", { exact: true }).fill(phone);
    const row = page.locator(`[data-egypt-id="${requestId}"]`);
    await expect(row).toBeVisible();
    await expect(page.locator("[data-egypt-id]")).toHaveCount(1);
    // What the row shows is what the server computed.
    const queue = (await (await page.request.get(`${BACKEND}/api/contact-requests/egypt/queue?search=${phone}`)).json()).data;
    const serverRow = queue.rows.find((r: { id: string }) => r.id === requestId);
    await expect(row).toContainText(serverRow.stageLabel);
    await expect(row).toContainText(serverRow.nextAction);
    await expect(row).toContainText("بلا تاريخ");
    await expect(row).toContainText("بانتظار التحويل");

    // A stage filter that excludes the request hides it (filtered by the server).
    await page.getByLabel("المرحلة", { exact: true }).selectOption("CIRCULAR_ISSUED");
    await expect(page.getByText("لا توجد طلبات مطابقة.")).toBeVisible();
    await page.getByLabel("المرحلة", { exact: true }).selectOption("AWAITING_PAYMENT");
    await expect(row).toBeVisible();
    await page.getByLabel("الموظف المسؤول", { exact: true }).selectOption("unassigned");
    await expect(row).toBeVisible();
    await page.getByLabel("الموظف المسؤول", { exact: true }).selectOption("mine");
    await expect(page.getByText("لا توجد طلبات مطابقة.")).toBeVisible();
    await page.getByLabel("الموظف المسؤول", { exact: true }).selectOption("");

    await assertNoHorizontalOverflow(page);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/admin/cases\\?requestId=${requestId}&tab=egypt`));
    await expect(page.getByRole("button", { name: "الموافقة الأمنية" })).toBeVisible();
    await expect(page.locator("#egypt-workspace")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("egypt-stage")).toHaveText(serverRow.stageLabel);
    await expect(page.locator("[data-egypt-next]")).toHaveText(serverRow.nextAction);
    expect(failures).toEqual([]);
  });

  test("workspace actions go through the server: rules refuse an early approval, changes are saved and logged", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto(`/admin/cases?requestId=${requestId}&tab=egypt`);
    const ws = page.locator("#egypt-workspace");
    await expect(ws).toBeVisible({ timeout: 20_000 });

    // Payment is not confirmed: the backend refuses the approval and the UI shows its reason.
    const approval = page.getByTestId("egypt-approval");
    await approval.locator('input[name="file"]').setInputFiles({ name: "approval.pdf", mimeType: "application/pdf", buffer: PDF });
    await approval.getByRole("button", { name: "تسجيل إصدار الموافقة" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("لم يُقبل الدفع بعد");
    let state = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/egypt`)).json()).data;
    expect(state.approvalIssued).toBe(false);
    // The circular cannot be started before the approval: no control is offered.
    await expect(page.getByRole("button", { name: "بدء تجهيز التعميم" })).toHaveCount(0);

    // Travel date (with the recorded reason) and priority/deadline.
    const travelDate = khartoumDay(10);
    const schedule = page.getByTestId("egypt-schedule");
    await schedule.getByLabel("تاريخ السفر").fill(travelDate);
    await schedule.getByLabel("السبب (يُسجَّل)").fill("تأكيد العميل هاتفيًا");
    await schedule.getByRole("button", { name: "حفظ التاريخ" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم حفظ تاريخ السفر" })).toBeVisible();
    await expect(page.getByTestId("egypt-schedule").getByLabel("تاريخ السفر")).toHaveValue(travelDate);

    const due = khartoumDay(5);
    await page.getByTestId("egypt-schedule").getByLabel("الأولوية").selectOption("HIGH");
    await page.getByTestId("egypt-schedule").getByLabel("موعد الإنجاز").fill(due);
    await page.getByTestId("egypt-schedule").getByRole("button", { name: "حفظ الأولوية" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم حفظ الأولوية" })).toBeVisible();

    state = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/egypt`)).json()).data;
    expect(state.travelDate).toBe(travelDate);
    expect(state.priority).toBe("HIGH");
    expect(String(state.dueAt).slice(0, 10)).toBe(due);

    // Air entry: flight details form; saved unverified.
    const flight = page.getByTestId("egypt-flight");
    await flight.getByLabel("رقم الرحلة").fill("MS852");
    await flight.getByRole("button", { name: "حفظ بيانات الرحلة" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم حفظ بيانات الرحلة" })).toBeVisible();
    await expect(page.getByTestId("egypt-flight")).toContainText("لم يُتحقق منها بعد");

    // Each change is audited by the server and appears in the case's log.
    const timeline = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/timeline`)).json()).data as Array<{ action: string; user: { fullName: string } | null }>;
    for (const action of ["EGYPT_TRAVEL_DATE_CHANGED", "CONTACT_REQUEST_PRIORITY_UPDATED"]) {
      expect(timeline.find((entry) => entry.action === action)?.user?.fullName, action).toBeTruthy();
    }

    // The queue now shows the travel date the server stored.
    await page.goto("/admin/egypt");
    await page.getByLabel("بحث", { exact: true }).fill(phone);
    await expect(page.locator(`[data-egypt-id="${requestId}"]`)).toContainText(travelDate);
    await expect(page.locator(`[data-egypt-id="${requestId}"]`)).toContainText("أولوية عالية");
  });

  test("roles: EMPLOYEE works the queue; ACCOUNTANT has no menu entry and the server refuses the queue", async ({ browser }) => {
    const employee = await staffPage(browser, admin, "EMPLOYEE");
    await employee.page.goto(`${WEB}/admin/egypt`);
    await expect(employee.page.getByRole("navigation", { name: "تنقل الإدارة" }).getByRole("link", { name: "الموافقة الأمنية لمصر" })).toBeVisible();
    await employee.page.getByLabel("بحث", { exact: true }).fill(phone);
    await expect(employee.page.locator(`[data-egypt-id="${requestId}"]`)).toBeVisible();
    await employee.context.close();

    const accountant = await staffPage(browser, admin, "ACCOUNTANT");
    await accountant.page.goto(`${WEB}/admin/egypt`);
    await expect(accountant.page.getByRole("heading", { name: "الموافقة الأمنية لمصر", level: 1 })).toBeVisible();
    await expect(accountant.page.getByRole("navigation", { name: "تنقل الإدارة" }).getByRole("link", { name: "الموافقة الأمنية لمصر" })).toHaveCount(0);
    await expect(accountant.page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
    await expect(accountant.page.locator("[data-egypt-id]")).toHaveCount(0);
    const direct = await accountant.page.request.get(`${BACKEND}/api/contact-requests/egypt/queue`);
    expect(direct.status()).toBe(403);
    await accountant.context.close();
  });
});
