import { expect, test } from "@playwright/test";

// Website service wizard, fixed-price item: the review step shows the final
// total and currency, sending needs an explicit confirmation, the confirmed
// total + currency are sent (same contract as the app,
// backend contact-request-pricing/fixed-price.js), and a 409 PRICE_CHANGED
// replaces the total and asks for a new confirmation. API fully mocked.

test("fixed price: confirm total and currency, re-confirm after PRICE_CHANGED", async ({ page }) => {
  await page.route("**/api/services/public**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          services: [],
          visaTypes: [
            {
              id: "visa-fixed-e2e",
              code: "VISA-FIXED-E2E",
              name: "تأشيرة بسعر ثابت",
              country: "دولة اختبار",
              description: null,
              basePrice: "150",
              currency: "USD",
              fxRateToSdg: null,
              priceSdg: null,
              serviceId: null,
              category: "INTERNATIONAL",
              pricingMode: "FIXED",
              priceUnit: "PER_TRAVELER",
              paymentAfterDocumentReview: false,
            },
          ],
        },
      }),
    })
  );
  await page.route("**/api/visa-types/visa-fixed-e2e/requirements/public", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) })
  );
  await page.route("**/api/intake-drafts**", (route) => route.fulfill({ status: 503, body: "{}" }));

  const sent: Array<Record<string, string>> = [];
  await page.route("**/api/contact-requests", async (route) => {
    const body = route.request().postData() || "";
    const field = (name: string) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? "";
    sent.push({ acceptedTotal: field("acceptedTotal"), acceptedCurrency: field("acceptedCurrency") });
    if (sent.length === 1) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "PRICE_CHANGED",
          message: "تغيّر سعر الخدمة منذ أن راجعته. راجع الإجمالي الجديد ثم أكّد الطلب.",
          details: { pricingMode: "FIXED", total: 180, currency: "USD", unitPrice: 180, priceUnit: "PER_TRAVELER", units: 1 },
        }),
      });
      return;
    }
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { id: "REQ-FIXED-E2E" } }) });
  });

  await page.goto("/visas?visaType=VISA-FIXED-E2E&visaCategory=INTERNATIONAL#book");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByPlaceholder("اسمك الكامل").fill("عميل سعر ثابت");
  await page.getByPlaceholder("+249 9XX XXX XXX").fill("+249900000001");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();

  const send = page.getByRole("button", { name: "إرسال الطلب" });
  await expect(page.getByTestId("fixed-total")).toHaveText("150 USD");
  await expect(send).toBeDisabled();
  await page.getByTestId("confirm-fixed-total").check();
  await send.click();

  await expect(page.getByText("تغيّر سعر الخدمة منذ أن راجعته")).toBeVisible();
  await expect(page.getByTestId("fixed-total")).toHaveText("180 USD");
  await expect(page.getByTestId("confirm-fixed-total")).not.toBeChecked();
  await expect(send).toBeDisabled();
  await page.getByTestId("confirm-fixed-total").check();
  await send.click();

  await expect(page.getByText("تم استلام طلبك")).toBeVisible();
  await expect(page.getByText("لن يصلك عرض سعر آخر")).toBeVisible();
  await expect(page.getByText("خطوة الدفع مفتوحة الآن")).toBeVisible();
  expect(sent).toEqual([
    { acceptedTotal: "150.00", acceptedCurrency: "USD" },
    { acceptedTotal: "180.00", acceptedCurrency: "USD" },
  ]);
});
