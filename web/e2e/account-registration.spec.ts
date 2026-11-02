import { expect, test, type BrowserContext } from "@playwright/test";

// Website registration against the real backend, in a browser that drops the
// API's cross-site session cookie (production: nasaem-alharamain.com calls the
// API on another domain, and many browsers block that cookie). Before the fix
// registration succeeded but /account found no session and sent the customer
// back to the login page.

const BACKEND = "http://localhost:5000";

async function blockApiCookies(context: BrowserContext) {
  // route.fetch() writes Set-Cookie into the context's jar itself, so the
  // session cookie is removed after every API response: the browser never
  // holds it, exactly like a browser that blocks third-party cookies.
  await context.route(`${BACKEND}/api/**`, async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers["set-cookie"];
      const body = await response.body();
      await context.clearCookies({ name: "customerAccessToken" });
      await route.fulfill({ status: response.status(), headers, body });
    } catch {
      // The test already finished while the account page was still loading
      // its panels in the background; nothing left to answer.
    }
  });
}

function uniquePhone() {
  return `+2499${`${Date.now()}`.slice(-8)}`;
}

async function register(page: import("@playwright/test").Page, name: string, phone: string) {
  await page.goto("/account/register");
  await page.locator("#fullName").fill(name);
  await page.locator("#phone").fill(phone);
  await page.locator("#password").fill("Test@12345");
}

test.describe("website registration signs the customer in", () => {
  // Background requests of the account page can outlive a test: stop routing
  // them before the context closes.
  test.afterEach(async ({ context }) => {
    await context.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("register → straight into the account, without the API cookie; one request for a double click; network failure keeps the session; logout ends it", async ({ page, context }) => {
    await blockApiCookies(context);
    const phone = uniquePhone();
    const name = `عميل تسجيل ${phone.slice(-6)}`;
    await register(page, name, phone);

    let registrations = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/customer-auth/register") && req.method() === "POST") registrations += 1;
    });
    await page.getByRole("button", { name: "إنشاء الحساب" }).dblclick();

    await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
    expect(registrations, "a double click sends one registration").toBe(1);
    expect((await context.cookies(BACKEND)).some((c) => c.name === "customerAccessToken"), "the cookie really was blocked").toBe(false);

    // A reload keeps the customer signed in.
    await page.reload();
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });

    // Network failure on the account page: the customer stays, with a retry
    // (only a 401 means «sign in again»).
    await context.route(`${BACKEND}/api/customer-auth/me`, (route) => route.abort("internetdisconnected"));
    await page.reload();
    await expect(page.getByTestId("account-load-error")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/account$/);
    await context.unroute(`${BACKEND}/api/customer-auth/me`);
    await page.getByRole("button", { name: "إعادة المحاولة" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL(/\/account\/login/);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login/, { timeout: 15_000 });
  });

  test("an existing phone: no second account, a direct link to sign in with that number", async ({ page, context }) => {
    await blockApiCookies(context);
    const phone = uniquePhone();
    const created = await page.request.post(`${BACKEND}/api/customer-auth/register`, {
      data: { fullName: "عميل موجود", phone, password: "Test@12345" },
    });
    expect(created.status()).toBe(201);

    await register(page, "عميل مكرر", phone);
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByTestId("auth-error")).toContainText("مستخدم بالفعل");
    await page.getByTestId("existing-account-login").click();
    await expect(page).toHaveURL(/\/account\/login\?identifier=/);
    await expect(page.locator("#identifier")).toHaveValue(phone);
    await page.locator("#password").fill("Test@12345");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByRole("heading", { name: "عميل موجود" })).toBeVisible({ timeout: 15_000 });
  });

  test("a session the server no longer accepts goes to sign-in with a notice", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("nasaem.customer.token.v1", "not-a-valid-token"));
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/login\?expired=1/, { timeout: 15_000 });
    await expect(page.getByText("انتهت جلستك")).toBeVisible();
  });
});
