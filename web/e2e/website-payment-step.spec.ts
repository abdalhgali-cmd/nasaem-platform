import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// /track payment step against the real backend: amount and currency, the
// agency account (bank, holder, number with copy) and the receipt upload
// shown together; an uploaded receipt makes the payment "under review",
// never paid, until staff confirm it.

const BACKEND = "http://localhost:5000";

test("website payment step: details, copy, receipt upload -> under review (not paid)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginAsSeededAdmin(page);
  const admin = page.request;
  const stamp = `${Date.now()}`.slice(-8);
  const phone = `2499${stamp}`;
  const accountNumber = `E2EPAY${stamp}`;

  const created = await admin.post(`${BACKEND}/api/contact-requests`, {
    data: { name: `عميل دفع ${stamp}`, phone, service: "اختبار الدفع", message: "طلب اختبار خطوة الدفع" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const requestId = (await created.json()).data.id as string;
  const account = await admin.post(`${BACKEND}/api/payment-accounts`, {
    data: { name: `E2E ${accountNumber}`, bankName: "بنك الاختبار", accountName: "وكالة نسائم الاختبار", accountNumber, currency: "SAR" },
  });
  expect(account.ok(), await account.text()).toBeTruthy();
  const accountId = (await account.json()).data.id as string;
  const invoice = await admin.post(`${BACKEND}/api/contact-requests/${requestId}/invoice`, { data: { amount: 250, currency: "SAR" } });
  expect(invoice.ok(), await invoice.text()).toBeTruthy();

  try {
    await page.goto("/track");
    await page.locator("#phone").fill(`+${phone}`);
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.locator("#code").fill(readTrackingLoginCode(phone));
    await page.getByRole("button", { name: "تأكيد" }).click();
    // Quote-required: server-driven, service-specific circles with exactly one current stage.
    const progress = page.getByTestId("request-progress");
    await expect(progress.locator('[role="tab"][data-step="QUOTE"]')).toHaveAttribute("data-state", "current", { timeout: 15_000 });
    await expect(progress.locator('[role="tab"][data-step="RECEIVED"]')).toHaveAttribute("data-state", "done");
    await expect(progress.locator('[role="tab"][data-state="current"]')).toHaveCount(1);
    await expect(progress.locator('[role="tab"][data-step="PAYMENT"]')).toHaveAttribute("data-state", "upcoming");
    const panel = progress.getByTestId("progress-panel");
    await expect(panel).toContainText("عرض السعر بانتظار موافقتك.");
    // Interactive: another circle shows its own stage; arrow keys move between stages.
    await progress.locator('[role="tab"][data-step="PAYMENT"]').click();
    await expect(panel.getByTestId("progress-panel-state")).toHaveText("لم تبدأ بعد");
    await progress.locator('[role="tab"][data-step="PAYMENT"]').press("Home");
    await expect(progress.locator('[role="tab"][data-step="RECEIVED"]')).toBeFocused();
    await expect(progress.locator('[role="tab"][data-step="RECEIVED"]')).toHaveAttribute("aria-selected", "true");
    await progress.locator('[role="tab"][data-step="QUOTE"]').click();
    await panel.getByRole("button", { name: "مراجعة السعر والموافقة عليه" }).click();
    await expect(page.getByRole("button", { name: "موافقة على السعر" })).toBeFocused();

    await page.getByRole("button", { name: "موافقة على السعر" }).click({ timeout: 15_000 });

    const step = page.getByTestId("payment-step");
    await expect(step.getByTestId("payment-amount")).toHaveText("250 SAR", { timeout: 15_000 });
    const card = step.getByTestId("payment-account").filter({ hasText: accountNumber });
    await expect(card).toContainText("بنك الاختبار");
    await expect(card).toContainText("وكالة نسائم الاختبار");
    await card.getByRole("button", { name: "نسخ رقم الحساب" }).click();
    await expect(card.getByText("تم النسخ")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(accountNumber);
    const receipt = step.locator('input[type="file"]');
    await expect(receipt).toHaveAttribute("accept", "image/*,application/pdf");

    await receipt.setInputFiles(path.join(__dirname, "fixtures", "sample-document.png"));
    const uploaded = page.waitForResponse((r) => r.url().endsWith(`/tracking/requests/${requestId}/payment-receipt`));
    await step.getByRole("button", { name: "رفع الإيصال للمراجعة" }).click();
    expect((await uploaded).status()).toBe(201);

    await expect(page.getByTestId("payment-under-review")).toContainText("قيد المراجعة", { timeout: 15_000 });
    await expect(page.getByTestId("payment-under-review")).toContainText("لا يُعتبر الطلب مدفوعًا");
    await expect(page.getByTestId("payment-step")).toHaveCount(0);
    await expect(progress.locator('[role="tab"][data-step="PAYMENT_REVIEW"]')).toHaveAttribute("data-state", "current");
    await expect(progress.locator('[role="tab"][data-step="PAYMENT"]')).toHaveAttribute("data-state", "done");

    const staff = await admin.get(`${BACKEND}/api/contact-requests/${requestId}`);
    expect((await staff.json()).data.paymentStatus).toBe("UNDER_REVIEW");
  } finally {
    await admin.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } });
  }
});
