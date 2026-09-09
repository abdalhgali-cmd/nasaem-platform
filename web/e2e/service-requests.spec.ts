import { expect, test, type Page } from "@playwright/test";

const catalog = { data: { services: [
  { id: "hotel-test", code: "SVC-HOTEL", name: "حجز الفنادق", category: "hotel" },
  { id: "ferry-test", code: "SVC-FERRY", name: "حجز العبارات", category: "ferry" },
] } };

async function setup(page: Page) {
  await page.route("**/api/services/public**", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/ferries/public**", (route) => route.fulfill({ json: { data: { operators: [], schedules: [] } } }));
}

async function customer(page: Page) {
  await page.getByLabel("الاسم الكامل", { exact: true }).fill("عميل اختبار");
  await page.getByLabel(/رقم الهاتف/).fill("+249900000000");
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("service request recovery and confirmation on mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const kind of ["hotels", "ferries", "contact"] as const) {
    test(`${kind}: displays the returned reference and phone-based tracking guidance`, async ({ page }) => {
      await setup(page);
      let submissions = 0;
      await page.route("**/api/contact-requests", async (route) => {
        submissions++;
        await route.fulfill({ status: 201, json: { success: true, data: { id: `REQ-${kind}` } } });
      });
      await page.goto(`/${kind}`);
      await customer(page);
      if (kind === "hotels") {
        await page.getByLabel("تاريخ الدخول").fill(futureDate(10));
        await page.getByLabel("تاريخ الخروج").fill(futureDate(12));
      } else if (kind === "ferries") {
        await page.getByLabel("تاريخ السفر").fill(futureDate(10));
      } else {
        await page.getByLabel("رسالتك").fill("أرغب في الاستفسار عن خدمة سفر.");
      }
      await page.getByRole("button", { name: kind === "hotels" ? "إرسال طلب الفندق" : kind === "ferries" ? "إرسال طلب حجز العبارة" : "إرسال الطلب", exact: true }).click();
      await expect(page.getByRole("heading", { name: "تم استلام طلبك بنجاح" })).toBeFocused();
      await expect(page.getByText(`REQ-${kind}`, { exact: true })).toBeVisible();
      await expect(page.getByText(/نفس رقم الهاتف الذي استخدمته/)).toBeVisible();
      await expect(page.getByRole("link", { name: "تابع طلبك من هنا" })).toHaveAttribute("href", "/track");
      expect(submissions).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("hotel catalog failure can recover without losing the entered name", async ({ page }) => {
    await setup(page);
    let available = false;
    await page.route("**/api/services/public**", (route) => route.fulfill(available ? { json: catalog } : { status: 503, body: "unavailable" }));
    await page.goto("/hotels");
    await expect(page.getByRole("button", { name: "إعادة تحميل الخدمة" })).toBeVisible();
    await customer(page);
    await expect(page.getByRole("button", { name: "إرسال طلب الفندق" })).toBeDisabled();
    available = true;
    await page.getByRole("button", { name: "إعادة تحميل الخدمة" }).click();
    await expect(page.getByRole("button", { name: "إرسال طلب الفندق" })).toBeEnabled();
    await expect(page.getByLabel("الاسم الكامل", { exact: true })).toHaveValue("عميل اختبار");
  });

  test("a malformed response preserves contact data and never claims success", async ({ page }) => {
    await setup(page);
    await page.route("**/api/contact-requests", (route) => route.fulfill({ status: 200, body: "<html>proxy response</html>" }));
    await page.goto("/contact");
    await customer(page);
    await page.getByLabel("رسالتك").fill("أرغب في الاستفسار عن خدمة سفر.");
    await page.getByRole("button", { name: "إرسال الطلب", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("تعذر تأكيد استلام الطلب");
    await expect(page.getByLabel("الاسم الكامل", { exact: true })).toHaveValue("عميل اختبار");
    await expect(page.getByRole("heading", { name: "تم استلام طلبك بنجاح" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "تحقق من طلباتك قبل إعادة الإرسال" })).toHaveAttribute("href", "/track");
  });
});
