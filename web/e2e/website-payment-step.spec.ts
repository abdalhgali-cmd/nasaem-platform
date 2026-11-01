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
    // Three receipt sources: the camera, a gallery image, a PDF.
    const camera = step.getByTestId("payment-receipt-camera");
    await expect(camera).toHaveAttribute("accept", "image/*");
    await expect(camera).toHaveAttribute("capture", "environment");
    await expect(step.getByTestId("payment-receipt-input")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    await expect(step.getByTestId("payment-receipt-pdf")).toHaveAttribute("accept", "application/pdf,.pdf");
    const send = step.getByRole("button", { name: "رفع الإيصال للمراجعة" });
    await expect(send).toBeDisabled();

    // A file of another type is refused before anything is sent.
    await step.getByTestId("payment-receipt-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a receipt") });
    await expect(step.getByTestId("payment-error")).toContainText("ارفع صورة (JPG/PNG/WEBP) أو ملف PDF.");
    // An image is previewed, then removed and replaced by a PDF (name and size).
    await step.getByTestId("payment-receipt-input").setInputFiles(path.join(__dirname, "fixtures", "sample-document.png"));
    await expect(step.getByTestId("receipt-preview").getByRole("img", { name: "معاينة إشعار التحويل" })).toBeVisible();
    await step.getByTestId("receipt-preview").getByRole("button", { name: "إزالة" }).click();
    await expect(step.getByTestId("receipt-preview")).toHaveCount(0);
    await step.getByTestId("payment-receipt-pdf").setInputFiles({ name: "transfer-receipt.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
    await expect(step.getByTestId("receipt-name")).toHaveText("transfer-receipt.pdf");

    // More than one account takes SAR (the seeded one too): nothing is
    // preselected, and the receipt is not sent until the customer picks one.
    await expect(step.getByRole("radio", { checked: true })).toHaveCount(0);
    await send.click();
    await expect(step.getByTestId("payment-error")).toHaveText("اختر الحساب الذي حوّلت إليه.");
    await card.getByRole("radio").check();
    await expect(card).toContainText("حوّل 250 SAR");

    // The chosen account and the invoice version shown travel with the receipt.
    let body = "";
    await page.route(`${BACKEND}/api/tracking/requests/${requestId}/payment-receipt`, async (route) => {
      body = route.request().postDataBuffer()?.toString("latin1") ?? "";
      await route.continue();
    });
    const uploaded = page.waitForResponse((r) => r.url().endsWith(`/tracking/requests/${requestId}/payment-receipt`));
    await send.click();
    const response = await uploaded;
    expect(response.status()).toBe(201);
    expect(body).toContain(accountId);
    expect(body).toMatch(/name="invoiceVersion"\r\n\r\n\d+/);

    await expect(page.getByTestId("payment-under-review")).toContainText("بانتظار مراجعة الدفع", { timeout: 15_000 });
    await expect(page.getByTestId("payment-under-review")).toContainText("قيد المراجعة");
    await expect(page.getByTestId("payment-under-review")).toContainText("لا يُعتبر الطلب مدفوعًا");
    await expect(page.getByTestId("payment-step")).toHaveCount(0);
    await expect(progress.locator('[role="tab"][data-step="PAYMENT_REVIEW"]')).toHaveAttribute("data-state", "current");
    await expect(progress.locator('[role="tab"][data-step="PAYMENT"]')).toHaveAttribute("data-state", "done");

    const staff = await admin.get(`${BACKEND}/api/contact-requests/${requestId}`);
    const stored = (await staff.json()).data;
    expect(stored.paymentStatus).toBe("UNDER_REVIEW");
    expect(stored.paymentConfirmedAt ?? null, "a receipt is never a payment").toBeNull();
    const receiptDoc = (stored.documents as Array<{ classification: string | null; paymentSettlement?: unknown }>).find((d) => d.classification === "FINANCIAL_DOCUMENT");
    expect(receiptDoc?.paymentSettlement).toMatchObject({ accountId, kind: "INVOICE_CURRENCY", source: "CUSTOMER_SELECTED" });
  } finally {
    await admin.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } });
  }
});
