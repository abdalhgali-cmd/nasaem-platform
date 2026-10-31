import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

// Operations Center (design system Phase 2), desktop. The mobile checks
// (filters, refresh, search, no overflow) stay in web.spec.ts.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";

async function staffPage(browser: Browser, admin: Page, role: "EMPLOYEE" | "ACCOUNTANT") {
  const email = `ops-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers: { Origin: WEB }, data: { fullName: `اختبار مركز العمليات ${role}`, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  expect((await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
  return { context, page };
}

// Records every failed API response the page itself makes.
function failedApiCalls(page: Page) {
  const failures: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith(`${BACKEND}/api/`) && response.status() >= 400) failures.push(`${response.status()} ${response.url().replace(BACKEND, "")}`);
  });
  return failures;
}

test.describe("Operations Center — desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("SUPER_ADMIN: service queues, the 6-column table, read-only payments and team workload", async ({ page }) => {
    await loginAsSeededAdmin(page);
    const failures = failedApiCalls(page);
    await page.goto("/admin/operations");
    await expect(page.getByRole("heading", { name: "مركز العمليات", level: 1 })).toBeVisible();
    await expect(page.getByText("تعذر تحميل مركز العمليات")).toHaveCount(0);

    const queues = page.getByRole("region", { name: "قوائم العمل" });
    for (const label of ["الموافقة الأمنية", "العمرة", "مستندات للمراجعة", "دفعات للمراجعة", "سفر قريب", "متأخرة عن الموعد"]) {
      await expect(queues.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "الموافقة الأمنية — حسب تاريخ السفر" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "العمرة — حسب الإجراء المطلوب" })).toBeVisible();

    const table = page.getByRole("table", { name: "ما يحتاج إجراءً الآن" });
    await expect(table.getByRole("columnheader")).toHaveText(["العميل والطلب", "الأولوية", "الحالة", "الدفع", "الموظف المسؤول", "الإجراء التالي"]);

    // Payments: a summary and a link only; decisions stay on /admin/payment-review.
    const payments = page.getByRole("region", { name: "ملخص الدفعات" });
    await expect(payments.getByRole("link", { name: /فتح صفحة مراجعة الدفعات/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /تأكيد الدفع|رفض/ })).toHaveCount(0);

    await expect(page.getByRole("region", { name: "توزيع العمل" })).toBeVisible();
    expect(await assertNoHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    expect(failures).toEqual([]);
  });

  test("EMPLOYEE: the same queues without the manager's team workload", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: employee } = await staffPage(browser, page, "EMPLOYEE");
    const failures = failedApiCalls(employee);
    await employee.goto("/admin/operations");
    await expect(employee.getByRole("heading", { name: "الموافقة الأمنية — حسب تاريخ السفر" })).toBeVisible();
    await expect(employee.getByRole("region", { name: "توزيع العمل" })).toHaveCount(0);
    expect(failures).toEqual([]);
    await context.close();
  });

  test("ACCOUNTANT: general queues and payments; no service queues it may not read, no failed calls", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: accountant } = await staffPage(browser, page, "ACCOUNTANT");
    const failures = failedApiCalls(accountant);
    await accountant.goto("/admin/operations");
    await expect(accountant.getByRole("region", { name: "قوائم العمل" }).getByText("دفعات للمراجعة", { exact: true })).toBeVisible();
    await expect(accountant.getByRole("heading", { name: "الموافقة الأمنية — حسب تاريخ السفر" })).toHaveCount(0);
    await expect(accountant.getByRole("region", { name: "ملخص الدفعات" })).toBeVisible();
    await expect(accountant.getByText("تعذر تحميل مركز العمليات")).toHaveCount(0);
    expect(failures).toEqual([]);
    await context.close();
  });

  test("a request row opens its workspace", async ({ page }) => {
    await loginAsSeededAdmin(page);
    // A real customer request through the public API, so there is a row to open.
    const created = await page.request.post(`${BACKEND}/api/contact-requests`, {
      headers: { Origin: WEB },
      multipart: { name: `OPS-E2E ${Date.now()}`, phone: `0912${String(Date.now()).slice(-6)}`, message: "Operations Center open-row check", service: "استفسار عام" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const id = (await created.json()).data.id as string;

    await page.goto("/admin/operations");
    await page.getByRole("textbox", { name: "بحث في الطلبات" }).fill(id);
    await page.getByRole("link", { name: `فتح ${id}` }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/cases\\?requestId=${id}`));
  });
});
