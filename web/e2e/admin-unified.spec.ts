import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

// One staff back-office (owner decision 2026-11-01): /admin is the entry, the
// Operations Center is the home page, and the old back-office screens are
// either replaced by /admin pages or open inside the unified admin.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";

async function staffPage(browser: Browser, admin: Page, role: "EMPLOYEE" | "ACCOUNTANT", fullName: string) {
  const email = `unified-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers: { Origin: WEB }, data: { fullName, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const login = await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  return { context, page };
}

test.describe("Unified admin — entry and sign-in", () => {
  test("signed out, /admin asks for sign-in; signing in opens the Operations Center", async ({ browser }) => {
    const password = process.env.SEED_ADMIN_PASSWORD;
    test.skip(!password, "SEED_ADMIN_PASSWORD is required");
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto("/admin/egypt");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fegypt$/);
    await expect(page.getByRole("heading", { name: "تسجيل دخول الموظفين" })).toBeVisible();

    await page.getByLabel("البريد الإلكتروني").fill("admin@nasaem-platform.local");
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "غير صحيحة" })).toBeVisible();

    await page.getByLabel("كلمة المرور").fill(password!);
    await page.getByRole("button", { name: "دخول" }).click();
    // Back to the page they came for.
    await expect(page).toHaveURL(/\/admin\/egypt$/);
    await page.goto("/admin/login");
    // Already signed in: the login page forwards to the dashboard home.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("navigation", { name: "تنقل الإدارة" }).getByRole("link", { name: "مركز العمليات" })).toHaveAttribute("aria-current", "page");
    await context.close();
  });

  test("a crafted ?next= never leaves the admin", async ({ page }) => {
    await loginAsSeededAdmin(page);
    for (const next of ["//evil.example", "https://evil.example/admin", "/\\evil.example", "/admin-dashboard.html"]) {
      await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
      await expect(page).toHaveURL(`${WEB}/admin`);
    }
  });

  test("/admin/operations still works: it is the same dashboard at /admin", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto("/admin/operations");
    await expect(page).toHaveURL(`${WEB}/admin`);
  });

  test("old back-office addresses open the matching unified page", async ({ page }) => {
    // Ten legacy URLs cross several cold-compiled Next.js routes. Keep the
    // individual redirect assertions strict, with a budget for the full loop.
    test.setTimeout(60_000);
    await loginAsSeededAdmin(page);
    const cases: [string, RegExp][] = [
      ["/admin-dashboard.html", /\/admin$/],
      ["/admin-dashboard.html#/requests/abc123", /\/admin\/cases\?requestId=abc123$/],
      ["/admin-dashboard.html?customerRequest=req9", /\/admin\/cases\?requestId=req9$/],
      ["/admin-dashboard.html#/egypt", /\/admin\/egypt$/],
      ["/admin-dashboard.html?order=ord1", /\/admin\/tools\/orders\?id=ord1$/],
      ["/admin-dashboard.html#/customers/cus1", /\/admin\/tools\/customers\?id=cus1$/],
      ["/admin-dashboard.html#/payments", /\/admin\/tools\/payments$/],
      ["/admin-dashboard.html#/management", /\/admin\/tools$/],
      ["/flight-management.html", /\/admin\/tools\/flight-inventory$/],
      ["/login.html", /\/admin(\/login)?$/],
    ];
    for (const [from, to] of cases) {
      await page.goto(from);
      await expect(page, from).toHaveURL(to);
    }
  });
});

test.describe("Unified admin — screens of the old back-office inside the admin", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("payment accounts open inside the admin, without the old header or tab bars", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto("/admin/tools/payment-accounts");
    await expect(page.getByRole("heading", { level: 1, name: "حسابات الدفع" })).toBeVisible();
    const frame = page.frameLocator('[data-testid="admin-tool-frame"]');
    await expect(frame.locator("#mgmt-payment-accounts")).toBeVisible();
    await expect(frame.locator("#app-header")).toHaveCount(0);
    await expect(frame.locator("#tabs")).toBeHidden();
    await expect(frame.locator("#mgmt-tabs")).toBeHidden();
    await expect(frame.locator("#mgmt-branches")).toBeHidden();
    // One navigation: the admin's rail marks the tool as the current page.
    await expect(page.getByRole("navigation", { name: "تنقل الإدارة" }).getByRole("link", { name: "حسابات الدفع" })).toHaveAttribute("aria-current", "page");
  });

  test("Egypt prices and alerts open on their own, without the old Egypt queue", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto("/admin/tools/egypt-settings");
    const frame = page.frameLocator('[data-testid="admin-tool-frame"]');
    await expect(frame.locator("[data-egypt-pricing-admin]")).toBeVisible();
    await expect(frame.locator("[data-egypt-alerts-admin]")).toBeVisible();
    await expect(frame.locator("#egypt-body")).toBeHidden();
  });

  test("the tools index lists every tool for a manager", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto("/admin/tools");
    for (const label of ["العملاء", "حسابات الدفع", "أسعار مصر وتنبيهاتها", "الفروع", "شركات الطيران"]) {
      await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
  });
});

test.describe("Unified admin — roles", () => {
  test("EMPLOYEE: no manager tools in the menu, the page refuses them, and so does the API", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: employee } = await staffPage(browser, page, "EMPLOYEE", "موظف اختبار اللوحة الموحدة");
    await employee.goto("/admin");
    const rail = employee.getByRole("navigation", { name: "تنقل الإدارة" });
    await rail.getByRole("button", { name: "العملاء والسجلات" }).click();
    await expect(rail.getByRole("link", { name: "العملاء", exact: true })).toBeVisible();
    await expect(rail.getByRole("link", { name: "حسابات الدفع" })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "الطيران والنقل" })).toHaveCount(0);

    await employee.goto("/admin/tools/payment-accounts");
    await expect(employee.getByRole("alert").filter({ hasText: "غير متاح لدورك" })).toBeVisible();
    await expect(employee.locator('[data-testid="admin-tool-frame"]')).toHaveCount(0);
    // Server-side: the role is refused by the API itself, whatever the page shows.
    expect((await employee.request.get(`${BACKEND}/api/users`)).status()).toBe(403);
    expect((await employee.request.get(`${BACKEND}/api/payment-accounts`)).status()).toBe(403);
    await context.close();
  });

  test("ACCOUNTANT: payments and records, no case work or settings", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: accountant } = await staffPage(browser, page, "ACCOUNTANT", "محاسب اختبار اللوحة الموحدة");
    await accountant.goto("/admin");
    const rail = accountant.getByRole("navigation", { name: "تنقل الإدارة" });
    for (const link of ["مراجعة الدفعات", "سجل الدفعات", "التقارير"]) await expect(rail.getByRole("link", { name: link, exact: true })).toBeVisible();
    for (const hidden of ["مساحة عمل الحالات", "حسابات الدفع", "أسعار مصر وتنبيهاتها"]) await expect(rail.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    await accountant.goto("/admin/tools/payments");
    await expect(accountant.frameLocator('[data-testid="admin-tool-frame"]').locator("#tab-payments")).toBeVisible();
    await context.close();
  });
});

test.describe("Unified admin — phone, tablet and desktop", () => {
  for (const [name, width, height] of [["phone", 360, 780], ["tablet", 768, 1024], ["desktop", 1280, 900]] as const) {
    test(`${name} (${width}px): dashboard and an embedded tool fit the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await loginAsSeededAdmin(page);
      await page.goto("/admin");
      await expect(page.getByRole("banner").getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
      expect(await assertNoHorizontalOverflow(page)).toBeLessThanOrEqual(1);
      await page.goto("/admin/tools/customers");
      await expect(page.frameLocator('[data-testid="admin-tool-frame"]').locator("#tab-customers")).toBeVisible();
      expect(await assertNoHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    });
  }
});
