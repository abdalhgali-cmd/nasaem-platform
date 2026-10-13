import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// Umrah on the website against the real backend, as its own section:
// package (fixed price set in the admin) → applicant → trip → pilgrim →
// documents (passport + guarantor residence, no personal photo) → summary
// with the final price → payment straight away (amount, the agency account,
// receipt) → confirmation with the request number and «بانتظار مراجعة
// التحويل». The receipt never marks the request paid; staff confirm it.

const BACKEND = "http://localhost:5000";
const FIXTURE = path.join(__dirname, "fixtures", "sample-document.png");

test("Umrah: fixed price → documents → summary → payment → receipt under review → staff confirm", async ({ page }) => {
  await loginAsSeededAdmin(page);
  const admin = page.request;
  const stamp = `${Date.now()}`.slice(-8);
  const code = `E2E-UMRAH-PAY-${stamp}`;
  const packageName = `باقة عمرة دفع E2E ${stamp}`;
  const customer = `معتمر اختبار ${stamp}`;
  const accountNumber = `E2EUMR${stamp}`;
  const created: { services: string[]; accounts: string[] } = { services: [], accounts: [] };

  const pkg = await admin.post(`${BACKEND}/api/services`, {
    data: { code, name: packageName, category: "UMRAH_PACKAGE", basePrice: 2500, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_REQUEST" },
  });
  expect(pkg.ok(), await pkg.text()).toBeTruthy();
  const packageId = (await pkg.json()).data.id as string;
  created.services.push(packageId);
  for (const requirement of [
    { name: "صورة الجواز ساري المفعول", scope: "TRAVELER" },
    { name: "إقامة الضامن", scope: "CASE" },
  ]) {
    const res = await admin.post(`${BACKEND}/api/services/${packageId}/requirements`, { data: { ...requirement, type: "DOCUMENT", required: true } });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  const account = await admin.post(`${BACKEND}/api/payment-accounts`, {
    data: { name: `E2E ${accountNumber}`, bankName: "بنك العمرة للاختبار", accountName: "وكالة نسائم الاختبار", accountNumber, currency: "SAR" },
  });
  expect(account.ok(), await account.text()).toBeTruthy();
  created.accounts.push((await account.json()).data.id);

  const requestsFor = async () => {
    const res = await admin.get(`${BACKEND}/api/contact-requests?limit=50&search=${encodeURIComponent(customer)}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).data as Array<{ id: string }>;
  };

  try {
    await page.goto(`/umrah?package=${code}`);
    await expect(page.getByRole("heading", { name: "اختر الباقة" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("button").filter({ hasText: packageName })).toBeVisible();
    await page.getByRole("button", { name: "التالي" }).click();

    // Applicant first, then the trip, then the pilgrims.
    await page.getByPlaceholder("اسمك الكامل").fill(customer);
    await page.getByPlaceholder("+249 9XX XXX XXX").fill(`+2499${stamp}`);
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByRole("heading", { name: "متى ترغب في أداء العمرة؟" })).toBeVisible();
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByPlaceholder("اسم المسافر 1").fill(customer);
    await page.getByRole("button", { name: "التالي" }).click();

    // Documents from the admin checklist: passport + guarantor residence, no personal photo.
    await expect(page.getByText("إقامة الضامن").first()).toBeVisible();
    await expect(page.getByText("الصورة الشخصية")).toHaveCount(0);
    for (let i = 0; i < 2; i += 1) {
      await page.locator('label:has-text("اختر ملفًا") input[type="file"]').first().setInputFiles(FIXTURE);
    }
    await page.getByRole("button", { name: "التالي" }).click();

    // Summary with the final price; going back keeps what was entered.
    await expect(page.getByTestId("fixed-total")).toHaveText("2,500 SAR");
    await page.getByRole("button", { name: "السابق" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText(customer).first()).toBeVisible();
    const send = page.getByRole("button", { name: "تأكيد ومتابعة إلى الدفع" });
    await expect(send).toBeDisabled();
    await page.getByTestId("confirm-fixed-total").check();
    const submitted = page.waitForResponse((r) => r.url().endsWith("/api/contact-requests") && r.request().method() === "POST");
    await send.dblclick();
    expect((await submitted).status()).toBe(201);

    // Payment straight away: amount, the agency account in SAR, receipt.
    const step = page.getByTestId("payment-step");
    await expect(step.getByTestId("payment-amount")).toHaveText("2,500 SAR", { timeout: 15_000 });
    await expect(step.getByTestId("payment-account").filter({ hasText: accountNumber })).toContainText("بنك العمرة للاختبار");
    await step.getByTestId("payment-receipt-input").setInputFiles(FIXTURE);
    const uploaded = page.waitForResponse((r) => r.url().includes("/payment-access/receipt"));
    await step.getByRole("button", { name: "إرسال الطلب للمراجعة" }).click();
    expect((await uploaded).status()).toBe(201);

    await expect(page.getByText("تم استلام طلبك")).toBeVisible();
    await expect(page.getByTestId("payment-status")).toHaveText("بانتظار مراجعة التحويل");

    const found = await requestsFor();
    expect(found, "a double tap never creates a second request").toHaveLength(1);
    const detail = (await (await admin.get(`${BACKEND}/api/contact-requests/${found[0].id}`)).json()).data;
    expect(detail.serviceId).toBe(packageId);
    expect(detail.pricingMode).toBe("FIXED");
    expect(detail.paymentStatus).toBe("UNDER_REVIEW");
    expect(Number(detail.invoice.amount)).toBe(2500);
    expect(detail.invoice.currency).toBe("SAR");
    const labels = (detail.documents as Array<{ label: string; classification: string | null }>).map((d) => d.label);
    expect(labels.some((label) => label.includes("إقامة الضامن"))).toBe(true);
    expect(labels.some((label) => label.includes("الجواز"))).toBe(true);
    expect((detail.documents as Array<{ classification: string | null }>).some((d) => d.classification === "FINANCIAL_DOCUMENT")).toBe(true);

    const confirmed = await admin.post(`${BACKEND}/api/contact-requests/${found[0].id}/confirm-payment`, { data: {} });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    const after = (await (await admin.get(`${BACKEND}/api/contact-requests/${found[0].id}`)).json()).data;
    expect(after.paymentStatus).toBe("CONFIRMED");
  } finally {
    for (const id of created.accounts) await admin.patch(`${BACKEND}/api/payment-accounts/${id}`, { data: { active: false } });
    for (const id of created.services) await admin.patch(`${BACKEND}/api/services/${id}`, { data: { active: false } });
  }
});
