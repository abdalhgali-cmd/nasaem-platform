import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

// Admin Shell (design system Phase 1): navigation, roles, branding and the
// admin-only colour scope. Behaviour must match the previous shell exactly;
// only the presentation changed.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
// Signed out, the shell sends staff to /admin-dashboard.html, whose own
// script forwards to /login.html?next=%2Fadmin-dashboard.html.
const STAFF_LOGIN = /\/(admin-dashboard|login)\.html/;

async function resolvedPrimary(page: Page, container: string) {
  return page.evaluate((sel) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-primary)";
    document.querySelector(sel)!.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, container);
}

test.describe("Admin Shell — SUPER_ADMIN, desktop", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test.beforeEach(async ({ page }) => {
    await loginAsSeededAdmin(page);
  });

  test("navy rail with the official logo, every group, active item and breadcrumb", async ({ page }) => {
    await page.goto("/admin/operations");
    const rail = page.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(rail).toBeVisible();

    const logo = page.getByRole("img", { name: "نسائم الحرمين للسفر والسياحة" }).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    for (const group of ["العمل اليومي", "المال والتقارير", "الخدمات والموقع", "الفريق والنظام"]) {
      await expect(rail.getByRole("button", { name: group })).toBeVisible();
    }

    const current = rail.getByRole("link", { name: "مركز العمليات" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "المسار" })).toContainText("العمل اليومي");

    // Collapsed groups still open, and their links still navigate.
    await rail.getByRole("button", { name: "الفريق والنظام" }).click();
    await rail.getByRole("link", { name: "المستخدمون" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("navigation", { name: "تنقل الإدارة" }).getByRole("link", { name: "المستخدمون" })).toHaveAttribute("aria-current", "page");

    // Header controls keep their accessible names.
    // (The sidebar also has a «الإشعارات» link, as before; check the header's.)
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "الإشعارات" })).toBeVisible();
    await expect(header.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
    expect(await assertNoHorizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("admin colours are scoped: the admin uses the design tokens, the public site keeps its own", async ({ page }) => {
    await page.goto("/admin/operations");
    await expect(page.locator(".nh-admin")).toHaveCount(1);
    const adminPrimary = await resolvedPrimary(page, ".nh-admin");
    expect(adminPrimary).toBe("rgb(46, 55, 146)"); // #2e3792, provisional brand navy

    // The public website is outside the scope: its primary colour is the
    // globals.css default or the Appearance (المظهر) value, never the admin token.
    await page.goto("/");
    await expect(page.locator(".nh-admin")).toHaveCount(0);
    const publicPrimary = await resolvedPrimary(page, "body");
    expect(publicPrimary).not.toBe("rgb(46, 55, 146)");
  });
});

// A fresh staff account of `role`, created by the seeded SUPER_ADMIN through
// the real users API, signed in on its own browser context.
async function staffPage(browser: Browser, admin: Page, role: "ADMIN" | "EMPLOYEE" | "ACCOUNTANT", fullName: string) {
  const email = `shell-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers: { Origin: WEB }, data: { fullName, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const login = await page.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  return { context, page };
}

test.describe("Admin Shell — role filtering", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("an EMPLOYEE sees only the items their role allows", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: employee } = await staffPage(browser, page, "EMPLOYEE", "موظف اختبار القائمة");

    await employee.goto("/admin/operations");
    const rail = employee.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(rail.getByRole("link", { name: "مركز العمليات" })).toBeVisible();
    await expect(rail.getByRole("link", { name: "مساحة عمل الحالات" })).toBeVisible();
    await expect(employee.getByText("موظف عمليات").first()).toBeVisible();

    // Groups with nothing the role can open are not rendered at all.
    await expect(rail.getByRole("button", { name: "المال والتقارير" })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "الفريق والنظام" })).toHaveCount(0);
    await rail.getByRole("button", { name: "الخدمات والموقع" }).click();
    await expect(rail.getByRole("link", { name: "مجموعات العمرة" })).toBeVisible();
    await expect(rail.getByRole("link", { name: "الخدمات", exact: true })).toHaveCount(0);
    await context.close();
  });

  test("an ADMIN sees every group, like SUPER_ADMIN, with the «مدير النظام» label", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: admin } = await staffPage(browser, page, "ADMIN", "مدير اختبار القائمة");
    await admin.goto("/admin/operations");
    const rail = admin.getByRole("navigation", { name: "تنقل الإدارة" });
    for (const group of ["العمل اليومي", "المال والتقارير", "الخدمات والموقع", "الفريق والنظام"]) {
      await expect(rail.getByRole("button", { name: group })).toBeVisible();
    }
    await expect(admin.getByRole("banner").getByText("مدير النظام")).toBeVisible();
    await rail.getByRole("button", { name: "الفريق والنظام" }).click();
    await expect(rail.getByRole("link", { name: "المستخدمون" })).toBeVisible();
    await context.close();
  });

  test("an ACCOUNTANT sees operations, documents and the finance group only", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    const { context, page: accountant } = await staffPage(browser, page, "ACCOUNTANT", "محاسب اختبار القائمة");
    await accountant.goto("/admin/operations");
    await expect(accountant.getByText("تعذر تحميل مركز العمليات")).toHaveCount(0);
    const rail = accountant.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(accountant.getByRole("banner").getByText("المحاسب")).toBeVisible();

    for (const link of ["مركز العمليات", "الإشعارات", "المستندات", "التقارير", "مراجعة الدفعات", "الموافقات"]) {
      await expect(rail.getByRole("link", { name: link, exact: true })).toBeVisible();
    }
    for (const hidden of ["مساحة عمل الحالات", "الإسناد", "الأسعار والباقات"]) {
      await expect(rail.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }
    await expect(rail.getByRole("button", { name: "الخدمات والموقع" })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "الفريق والنظام" })).toHaveCount(0);

    await rail.getByRole("link", { name: "مراجعة الدفعات" }).click();
    await expect(accountant).toHaveURL(/\/admin\/payment-review$/);
    await context.close();
  });
});

test.describe("Admin Shell — session and notifications", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test("signed out: /admin redirects to the staff login page", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/admin/operations");
    await expect(page).toHaveURL(STAFF_LOGIN);
    await context.close();
  });

  test("the header notifications link opens notifications; logout ends the session", async ({ browser, page }) => {
    await loginAsSeededAdmin(page);
    // A dedicated account, so logging out never invalidates the shared admin session.
    const { context, page: staff } = await staffPage(browser, page, "EMPLOYEE", "موظف اختبار الخروج");
    await staff.goto("/admin/operations");
    const header = staff.getByRole("banner");
    await header.getByRole("link", { name: "الإشعارات" }).click();
    await expect(staff).toHaveURL(/\/admin\/notifications$/);

    await staff.getByRole("banner").getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(staff).toHaveURL(STAFF_LOGIN);
    await staff.goto("/admin/operations");
    await expect(staff).toHaveURL(STAFF_LOGIN);
    await context.close();
  });
});

test.describe("Admin Shell — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("drawer opens and closes, navigation works, no horizontal overflow", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto("/admin/operations");
    expect(await assertNoHorizontalOverflow(page)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("navigation", { name: "تنقل الإدارة" })).toBeHidden();

    await page.getByRole("button", { name: "فتح القائمة" }).click();
    const drawerNav = page.getByRole("navigation", { name: "تنقل الإدارة" });
    await expect(drawerNav).toBeVisible();
    await page.getByRole("button", { name: "إغلاق القائمة" }).click();
    await expect(drawerNav).toBeHidden();

    await page.getByRole("button", { name: "فتح القائمة" }).click();
    await drawerNav.getByRole("link", { name: "مساحة عمل الحالات" }).click();
    await expect(page).toHaveURL(/\/admin\/cases/);
  });
});
