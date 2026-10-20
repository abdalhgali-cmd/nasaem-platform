import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Issue #101: the website's request → payment path survives a dropped
// connection and a rejected receipt, against the real backend.
//  1. The connection drops after the server created the request: the
//     customer sees an Arabic message (not «Failed to fetch»), retries, and
//     lands on the same request's payment step — one request only.
//  2. A receipt already reached the server and the reply was lost: the step
//     checks the server and finishes («بانتظار مراجعة الدفع»), no second
//     receipt.
//  3. Staff reject the receipt: /track shows the reason, a new receipt goes
//     back under review, and the payment is never confirmed by the customer.

const BACKEND = "http://localhost:5000";
const FIXTURE = path.join(__dirname, "fixtures", "sample-document.png");
const NETWORK_MESSAGE = "انقطع الاتصال قبل وصول الرد. تحقق من الإنترنت ثم أعد المحاولة؛ لن يُرسل طلبك مرتين.";

test("payment recovery: lost reply on submit and on receipt, then rejection and a new receipt", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const staffPage = await (await browser.newContext()).newPage();
  await loginAsSeededAdmin(staffPage);
  const admin = staffPage.request;
  const stamp = `${Date.now()}`.slice(-8);
  const code = `E2E-PAY-RECOVERY-${stamp}`;
  const customer = `عميل استرداد ${stamp}`;
  const phone = `2499${stamp}`;
  const accountNumber = `E2EREC${stamp}`;

  const visa = await admin.post(`${BACKEND}/api/visa-types`, {
    data: { code, name: `تأشيرة اختبار الاسترداد ${stamp}`, country: "اختبار", category: "INTERNATIONAL", basePrice: 300, currency: "SAR", active: true },
  });
  expect(visa.ok(), await visa.text()).toBeTruthy();
  const visaId = (await visa.json()).data.id as string;
  expect((await admin.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { pricingMode: "FIXED", priceUnit: "PER_REQUEST" } })).ok()).toBeTruthy();
  const account = await admin.post(`${BACKEND}/api/payment-accounts`, {
    data: { name: `E2E ${accountNumber}`, bankName: "بنك الاسترداد", accountName: "وكالة الاختبار", accountNumber, currency: "SAR" },
  });
  expect(account.ok(), await account.text()).toBeTruthy();
  const accountId = (await account.json()).data.id as string;

  const requestsFor = async () => {
    const res = await admin.get(`${BACKEND}/api/contact-requests?limit=50&search=${encodeURIComponent(customer)}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).data as Array<{ id: string }>;
  };

  try {
    await page.goto(`/visas?visaType=${code}&visaCategory=INTERNATIONAL#book`);
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByPlaceholder("اسمك الكامل").fill(customer);
    await page.getByPlaceholder("+249 9XX XXX XXX").fill(`+${phone}`);
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByTestId("fixed-total")).toHaveText("300 SAR");
    await page.getByTestId("confirm-fixed-total").check();

    // 1) The server creates the request, but the reply never arrives.
    let dropped = false;
    await page.route(`${BACKEND}/api/contact-requests`, async (route) => {
      if (route.request().method() !== "POST" || dropped) return route.continue();
      dropped = true;
      await route.fetch();
      await route.abort("connectionreset");
    });
    const send = page.getByRole("button", { name: "تأكيد ومتابعة إلى الدفع" });
    await send.click();
    await expect(page.getByText(NETWORK_MESSAGE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Failed to fetch")).toHaveCount(0);
    expect(await requestsFor(), "the first attempt did reach the server").toHaveLength(1);

    const retried = page.waitForResponse((r) => r.url() === `${BACKEND}/api/contact-requests` && r.request().method() === "POST");
    await send.click();
    const retriedResponse = await retried;
    expect(retriedResponse.status(), "same submissionKey → the same request").toBe(200);
    const token = (await retriedResponse.json()).data.paymentAccess.token as string;
    const step = page.getByTestId("payment-step");
    await expect(step.getByTestId("payment-amount")).toHaveText("300 SAR", { timeout: 15_000 });
    const found = await requestsFor();
    expect(found, "no second request").toHaveLength(1);
    const id = found[0].id;

    // 2) An earlier attempt's receipt reached the server (sent here with the
    // same payment link), and this attempt's reply is lost: the step asks the
    // server and finishes instead of showing an error.
    const earlier = await page.request.post(`${BACKEND}/api/contact-requests/${id}/payment-access/receipt`, {
      headers: { "X-Payment-Access": token },
      multipart: { file: { name: "receipt.png", mimeType: "image/png", buffer: fs.readFileSync(FIXTURE) } },
    });
    expect(earlier.status(), await earlier.text()).toBe(201);
    await page.route(`${BACKEND}/api/contact-requests/${id}/payment-access/receipt`, (route) => route.abort("connectionreset"));
    await step.getByTestId("payment-account").filter({ hasText: accountNumber }).getByRole("radio").check();
    await step.getByTestId("payment-receipt-input").setInputFiles(FIXTURE);
    await step.getByRole("button", { name: "إرسال الطلب للمراجعة" }).click();
    await expect(page.getByTestId("payment-status")).toHaveText("بانتظار مراجعة الدفع", { timeout: 15_000 });
    let detail = (await (await admin.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(detail.paymentStatus).toBe("UNDER_REVIEW");
    expect((detail.documents as Array<{ classification: string | null }>).filter((d) => d.classification === "FINANCIAL_DOCUMENT")).toHaveLength(1);

    // 3) Staff reject; the customer sees why on /track and sends a new receipt.
    const rejected = await admin.post(`${BACKEND}/api/contact-requests/${id}/reject-payment`, { data: { reason: "المبلغ في الإيصال غير مطابق" } });
    expect(rejected.ok(), await rejected.text()).toBeTruthy();
    await page.goto("/track");
    await page.locator("#phone").fill(`+${phone}`);
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.locator("#code").fill(readTrackingLoginCode(phone));
    await page.getByRole("button", { name: "تأكيد" }).click();
    const trackStep = page.getByTestId("payment-step");
    await expect(trackStep).toContainText("المبلغ في الإيصال غير مطابق", { timeout: 15_000 });
    await expect(trackStep.getByTestId("payment-account").filter({ hasText: accountNumber })).toBeVisible();
    await trackStep.getByTestId("payment-account").filter({ hasText: accountNumber }).getByRole("radio").check();
    await trackStep.getByTestId("payment-receipt-input").setInputFiles(FIXTURE);
    await trackStep.getByRole("button", { name: "رفع الإيصال للمراجعة" }).click();
    await expect(page.getByTestId("payment-under-review")).toContainText("قيد المراجعة", { timeout: 15_000 });
    detail = (await (await admin.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(detail.paymentStatus, "a receipt is never a payment").toBe("UNDER_REVIEW");
    expect(detail.paymentConfirmedAt).toBeNull();
  } finally {
    await admin.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { data: { active: false } });
    await admin.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { active: false } });
  }
});
