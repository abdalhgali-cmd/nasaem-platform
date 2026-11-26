import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// Website account: a signed-in customer taps the «مستند مرفوض» notification and
// lands on the exact pilgrim's passport (two pilgrims), replaces only it, and
// the first passport, the receipt and the request reference stay as they were.
// Synthetic package, account, people and files.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const PNG = fs.readFileSync(path.join(__dirname, "fixtures", "sample-document.png"));
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const headers = { Origin: WEB };

test("account notification opens pilgrim 2's rejected passport; replacing it keeps pilgrim 1, the receipt and the reference", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}`.slice(-8);
  const phone = `+2499${stamp}`;
  const admin = await (await browser.newContext()).newPage();
  await loginAsSeededAdmin(admin);
  const pkg = await admin.request.post(`${BACKEND}/api/services`, { headers, data: {
    code: `E2E-CORR-${stamp}`, name: `تأشيرة عمرة تصحيح ${stamp}`, category: "UMRAH_PACKAGE", basePrice: 300, currency: "SAR",
    active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"],
  } });
  expect(pkg.ok(), await pkg.text()).toBeTruthy();
  const packageId = (await pkg.json()).data.id;
  const account = await admin.request.post(`${BACKEND}/api/payment-accounts`, { headers, data: { name: `E2E CORR ${stamp}`, bankName: "بنك اختبار", accountName: "حساب اختبار", accountNumber: `CORR${stamp}`, currency: "SAR" } });
  expect(account.ok(), await account.text()).toBeTruthy();
  const accountId = (await account.json()).data.id;
  try {
    const requirements = (await (await admin.request.get(`${BACKEND}/api/services/${packageId}/requirements/public`)).json()).data as Array<{ id: string; name: string }>;
    const residence = requirements.find((r) => r.name.includes("إقامة الضامن"))!;
    const passport = requirements.find((r) => /جواز|passport/i.test(r.name))!;

    // The customer registers on the website and submits from the signed-in session.
    await page.goto("/account/register");
    await page.locator("#fullName").fill(`عميل تصحيح ${stamp}`);
    await page.locator("#phone").fill(phone);
    await page.locator("#password").fill("Test@12345");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });
    const form = {
      name: `عميل تصحيح ${stamp}`, phone, message: "طلب عمرة لمعتمرين", serviceId: packageId, acceptedTotal: "600", acceptedCurrency: "SAR",
      guarantorPhone: "+966 50 777 8888",
      travelers: JSON.stringify([{ fullName: `المعتمر الأول ${stamp}`, isPrimary: true }, { fullName: `المعتمر الثاني ${stamp}` }]),
      documentLabels: JSON.stringify([passport.name, passport.name, "إقامة الضامن"]),
      documentRequirementIds: JSON.stringify([passport.id, passport.id, residence.id]),
      documentTravelerIndexes: JSON.stringify(["0", "1", ""]),
    };
    const data = new FormData();
    for (const [key, value] of Object.entries(form)) data.append(key, value);
    for (const name of ["p1.png", "p2.png", "residence.png"]) data.append("documents", new Blob([PNG], { type: "image/png" }), name);
    const submitted = await page.request.post(`${BACKEND}/api/contact-requests`, { headers: { ...headers, "X-Requested-With": "XMLHttpRequest" }, multipart: data });
    expect(submitted.status(), await submitted.text()).toBe(201);
    const body = (await submitted.json()).data;
    const requestId: string = body.id;
    const access = { ...headers, "x-payment-access": body.paymentAccess.token };
    const summary = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: access })).json()).data;
    const receipt = await page.request.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, { headers: access, multipart: { settlementAccountId: accountId, invoiceVersion: String(summary.invoiceVersion), file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(receipt.status(), await receipt.text()).toBe(201);

    const before = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(before.customer, "linked to the signed-in account").toBeTruthy();
    const [p1, p2] = before.travelers as Array<{ id: string; fullName: string }>;
    type Doc = { id: string; requirementId: string | null; travelerId: string | null; classification: string; supersededAt: string | null; status: string };
    const docs = before.documents as Doc[];
    const passport1 = docs.find((d) => d.requirementId === passport.id && d.travelerId === p1.id)!;
    const passport2 = docs.find((d) => d.requirementId === passport.id && d.travelerId === p2.id)!;
    const receiptDoc = docs.find((d) => d.classification === "FINANCIAL_DOCUMENT")!;
    expect(passport1 && passport2 && receiptDoc).toBeTruthy();
    const rejected = await admin.request.patch(`${BACKEND}/api/contact-requests/${requestId}/documents/${passport2.id}/status`, { headers, data: { status: "REJECTED", reviewNote: "الصورة غير واضحة" } });
    expect(rejected.ok(), await rejected.text()).toBeTruthy();

    // The notification opens the request at pilgrim 2's passport, with the reason.
    await page.goto("/account");
    await page.getByRole("tab", { name: "الإشعارات" }).click();
    await page.locator('[data-notification-type="CONTACT_REQUEST_DOCUMENT_REJECTED"]').first().click();
    const target = page.locator(`[data-checklist-row="${passport.id}::${p2.id}"]`);
    await expect(target).toBeVisible({ timeout: 15_000 });
    await expect(target).toHaveAttribute("data-state", "REJECTED");
    await expect(target).toContainText(p2.fullName);
    await expect(target).toContainText("السبب: الصورة غير واضحة");
    await expect(target.locator('input[type="file"]')).toBeFocused();
    await expect(page.locator(`[data-checklist-row="${passport.id}::${p1.id}"] input[type="file"]`), "pilgrim 1's accepted-or-pending passport offers no replace").toHaveCount(0);

    const uploaded = page.waitForResponse((r) => r.url().endsWith(`/api/customer/requests/${requestId}/documents`) && r.request().method() === "POST");
    await target.locator('input[type="file"]').setInputFiles({ name: "p2-new.png", mimeType: "image/png", buffer: PNG });
    expect((await uploaded).status()).toBe(201);
    await expect(page.locator(`[data-checklist-row="${passport.id}::${p2.id}"]`)).toHaveAttribute("data-state", "UNDER_REVIEW", { timeout: 15_000 });

    const after = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(after.id).toBe(requestId);
    const current = (after.documents as Doc[]).filter((d) => !d.supersededAt);
    expect(current.find((d) => d.id === passport1.id), "pilgrim 1's passport is kept").toBeTruthy();
    expect(current.find((d) => d.id === receiptDoc.id), "the receipt is kept").toBeTruthy();
    expect(current.find((d) => d.id === passport2.id), "the rejected passport is superseded").toBeFalsy();
    expect(current.filter((d) => d.requirementId === passport.id && d.travelerId === p2.id)).toHaveLength(1);
    expect(current).toHaveLength(docs.filter((d) => !d.supersededAt).length);
    expect(after.paymentStatus).toBe(before.paymentStatus);
  } finally {
    await admin.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin.request.patch(`${BACKEND}/api/services/${packageId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin.context().close();
  }
});
