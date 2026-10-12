import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// The website wizard's real submit path against the real backend: multipart
// POST /api/contact-requests with acceptedTotal + acceptedCurrency (the
// draft-submit route is covered by backend/tests/intakeDraftPricing.test.js).
// The agency changes the price after the customer's review: the server
// refuses (409 PRICE_CHANGED) without creating a request, the wizard shows
// the new total, and only the re-confirmed submission creates a FIXED
// request with an approved invoice at the new price.

const BACKEND = "http://localhost:5000";

test("website fixed price, real backend: stale total refused, nothing created, re-confirmed total recorded", async ({ page }) => {
  await loginAsSeededAdmin(page);
  const admin = page.request;
  const stamp = `${Date.now()}`.slice(-8);
  const code = `E2E-FIXED-${stamp}`;
  const customer = `عميل سعر ثابت ${stamp}`;

  const created = await admin.post(`${BACKEND}/api/visa-types`, {
    data: { code, name: `تأشيرة سعر ثابت ${stamp}`, country: "دولة اختبار", basePrice: 150, currency: "USD", active: true, category: "INTERNATIONAL" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const visaId = (await created.json()).data.id as string;
  const fixed = await admin.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { pricingMode: "FIXED", priceUnit: "PER_REQUEST" } });
  expect(fixed.ok(), await fixed.text()).toBeTruthy();

  const requestsFor = async () => {
    const res = await admin.get(`${BACKEND}/api/contact-requests?limit=50&search=${encodeURIComponent(customer)}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).data as Array<{ id: string }>;
  };

  try {
    await page.goto(`/visas?visaType=${code}&visaCategory=INTERNATIONAL#book`);
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByPlaceholder("اسمك الكامل").fill(customer);
    await page.getByPlaceholder("+249 9XX XXX XXX").fill(`+2499${stamp}`);
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();

    const send = page.getByRole("button", { name: "إرسال الطلب" });
    await expect(page.getByTestId("fixed-total")).toHaveText("150 USD");
    await page.getByTestId("confirm-fixed-total").check();

    // The agency changes the price after the customer reviewed it.
    const repriced = await admin.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { basePrice: 180 } });
    expect(repriced.ok(), await repriced.text()).toBeTruthy();

    const refused = page.waitForResponse((r) => r.url().endsWith("/api/contact-requests") && r.request().method() === "POST");
    await send.click();
    expect((await refused).status()).toBe(409);
    await expect(page.getByText("تغيّر سعر الخدمة منذ أن راجعته")).toBeVisible();
    await expect(page.getByTestId("fixed-total")).toHaveText("180 USD");
    await expect(page.getByTestId("confirm-fixed-total")).not.toBeChecked();
    await expect(send).toBeDisabled();
    expect(await requestsFor(), "a refused submission must not create a request").toHaveLength(0);

    await page.getByTestId("confirm-fixed-total").check();
    const accepted = page.waitForResponse((r) => r.url().endsWith("/api/contact-requests") && r.request().method() === "POST");
    await send.click();
    expect((await accepted).status()).toBe(201);
    await expect(page.getByText("تم استلام طلبك")).toBeVisible();

    const found = await requestsFor();
    expect(found).toHaveLength(1);
    const detail = (await (await admin.get(`${BACKEND}/api/contact-requests/${found[0].id}`)).json()).data;
    expect(detail.pricingMode).toBe("FIXED");
    expect(detail.paymentStatus).toBe("AWAITING_TRANSFER");
    expect(detail.pricingSnapshot.total).toBe(180);
    expect(detail.pricingSnapshot.currency).toBe("USD");
    expect(detail.invoice.status).toBe("APPROVED");
    expect(Number(detail.invoice.amount)).toBe(180);

    // /track: a fixed price has no quote stage; payment is the current stage.
    await page.goto("/track");
    await page.locator("#phone").fill(`+2499${stamp}`);
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.locator("#code").fill(readTrackingLoginCode(`2499${stamp}`));
    await page.getByRole("button", { name: "تأكيد" }).click();
    const progress = page.getByTestId("request-progress");
    await expect(progress.locator('[role="tab"][data-step="RECEIVED"]')).toHaveAttribute("data-state", "done", { timeout: 15_000 });
    await expect(progress.locator('[role="tab"][data-step="RECEIVED"]')).toHaveAttribute("aria-label", /تأكيد الطلب بالسعر الثابت/);
    await expect(progress.locator('[role="tab"][data-step="QUOTE"]')).toHaveCount(0);
    await expect(progress.locator('[role="tab"][data-step="PAYMENT"]')).toHaveAttribute("data-state", "current");
    await expect(page.getByRole("button", { name: "موافقة على السعر" })).toHaveCount(0);
    await expect(page.getByTestId("payment-amount")).toHaveText("180 USD");
  } finally {
    await admin.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { active: false } });
  }
});
