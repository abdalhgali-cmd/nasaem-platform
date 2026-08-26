import { expect, test } from "@playwright/test";

test.describe("P0 request confirmation and next-step UX", () => {
  test("public request confirmation explains next steps and copies the request number", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await page.route("**/api/services/public**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            services: [],
            visaTypes: [
              {
                id: "visa-type-e2e",
                code: "VISA-INTERNATIONAL",
                name: "التأشيرات الدولية",
                country: "دولة اختبار",
                description: null,
                basePrice: "0",
                currency: "SAR",
                serviceId: null,
                category: "INTERNATIONAL",
              },
            ],
          },
        }),
      });
    });

    await page.route("**/api/visa-types/visa-type-e2e/requirements/public", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/contact-requests", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "REQ-E2E-001" } }),
      });
    });

    await page.goto("/visas?visaType=VISA-INTERNATIONAL&visaCategory=INTERNATIONAL#book");
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByPlaceholder("اسمك الكامل").fill("عميل اختبار");
    await page.getByPlaceholder("+249 9XX XXX XXX").fill("+249900000000");
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "إرسال الطلب" }).click();

    await expect(page.getByText("تم استلام طلبك")).toBeVisible();
    await expect(page.getByText("ماذا سيحدث الآن؟")).toBeVisible();
    await expect(page.getByText("هذا طلب خدمة أولي، وليس عملية دفع أو طلبًا مؤكدًا داخل حساب العميل.")).toBeVisible();
    await expect(page.getByText("REQ-E2E-001")).toBeVisible();

    await page.getByRole("button", { name: "نسخ رقم الطلب" }).click();
    await expect(page.getByText("تم النسخ")).toBeVisible();
    await expect(page.getByRole("link", { name: "تابع طلبك من هنا" })).toBeVisible();
  });

  test("tracking request shows a derived next action and copyable reference", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    let verified = false;

    await page.route("**/api/tracking/requests**", async (route) => {
      if (!verified) {
        await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "REQ-E2E-002",
              service: "تأشيرة دولية",
              serviceRef: null,
              visaType: null,
              travelerCount: null,
              intakeData: null,
              message: "طلب اختبار",
              status: "CONTACTED",
              statusLabel: "تم التواصل معك بخصوص طلبك",
              createdAt: "2026-08-26T12:00:00.000Z",
              invoice: { amount: "100", currency: "SAR", description: null, status: "PENDING" },
              offers: [],
              selectedOfferId: null,
              paymentStatus: "NOT_REQUIRED",
              documents: [],
              deliverables: [],
              outcome: null,
              outcomeNote: null,
            },
          ],
        }),
      });
    });

    await page.route("**/api/tracking/request-code**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ message: "تم إرسال رمز التحقق عبر واتساب" }),
      });
    });
    await page.route("**/api/tracking/verify-code**", async (route) => {
      verified = true;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.goto("/track");
    await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
    await page.getByLabel("رقم الهاتف").fill("+249900000000");
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.getByLabel("رمز التحقق").fill("123456");
    await page.getByRole("button", { name: "تأكيد" }).click();

    await expect(page.getByText("الخطوة التالية")).toBeVisible();
    await expect(page.getByText("راجع السعر المقترح ثم اختر الموافقة أو الرفض.")).toBeVisible();
    await expect(page.getByText("REQ-E2E-002")).toBeVisible();
    await page.getByRole("button", { name: "نسخ رقم الطلب" }).click();
    await expect(page.getByText("تم النسخ")).toBeVisible();
  });
});
