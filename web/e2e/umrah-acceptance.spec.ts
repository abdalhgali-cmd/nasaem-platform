import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Acceptance: one two-pilgrim visa-only request, one reference throughout.
// Staff publish the first visa only after confirming the file, its pilgrim and
// what remains; the manager sees it as partially issued; the customer reads
// «صدرت تأشيرة واحدة من أصل تأشيرتين» and downloads it beside the right
// pilgrim; another customer cannot; the second visa completes the group.
// Synthetic package, account, people and files.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const PNG = fs.readFileSync(path.join(__dirname, "fixtures", "sample-document.png"));
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const headers = { Origin: WEB };

async function signInToTrack(page: Page, phone: string) {
  await page.context().clearCookies();
  await page.goto("/track");
  await page.locator("#phone").fill(phone);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await page.locator("#code").fill(readTrackingLoginCode(phone.replace(/\D/g, "")));
  await page.getByRole("button", { name: "تأكيد" }).click();
}

test.describe.serial("Umrah acceptance: partial issuance, manager view, secure download", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });
  const stamp = `${Date.now()}`.slice(-8);
  const phone = `+2499${stamp}`;
  const otherPhone = `+2499${String(Number(stamp) + 1).padStart(8, "0")}`;
  let admin: Page;
  let packageId = "";
  let accountId = "";
  let requestId = "";
  let travelers: Array<{ id: string; fullName: string }> = [];

  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(admin);
    const pkg = await admin.request.post(`${BACKEND}/api/services`, { headers, data: {
      code: `E2E-ACC-${stamp}`, name: `تأشيرة عمرة قبول ${stamp}`, category: "UMRAH_PACKAGE", basePrice: 795, currency: "SAR",
      active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY", "INCLUDED: إصدار تأشيرة العمرة"],
    } });
    expect(pkg.ok(), await pkg.text()).toBeTruthy();
    packageId = (await pkg.json()).data.id;
    const requirements = (await (await admin.request.get(`${BACKEND}/api/services/${packageId}/requirements/public`)).json()).data as Array<{ id: string; name: string }>;
    const residence = requirements.find((r) => r.name.includes("إقامة الضامن"))!;
    const passport = requirements.find((r) => /جواز|passport/i.test(r.name))!;
    const account = await admin.request.post(`${BACKEND}/api/payment-accounts`, { headers, data: { name: `E2E ACC ${stamp}`, bankName: "بنك اختبار", accountName: "حساب اختبار", accountNumber: `ACC${stamp}`, currency: "SAR" } });
    expect(account.ok(), await account.text()).toBeTruthy();
    accountId = (await account.json()).data.id;

    const form = new FormData();
    for (const [key, value] of Object.entries({
      name: `عميل قبول ${stamp}`, phone, message: "طلب عمرة لمعتمرين", serviceId: packageId, acceptedTotal: "1590", acceptedCurrency: "SAR",
      guarantorPhone: "+966 50 333 4444",
      travelers: JSON.stringify([{ fullName: `المعتمر الأول ${stamp}`, isPrimary: true }, { fullName: `المعتمر الثاني ${stamp}` }]),
      documentLabels: JSON.stringify(["إقامة الضامن", "جواز المعتمر الأول", "جواز المعتمر الثاني"]), documentRequirementIds: JSON.stringify([residence.id, passport.id, passport.id]), documentTravelerIndexes: JSON.stringify(["", "0", "1"]),
    })) form.append(key, value);
    for (const name of ["residence.png", "passport-0.png", "passport-1.png"]) form.append("documents", new Blob([PNG], { type: "image/png" }), name);
    const created = await admin.request.post(`${BACKEND}/api/contact-requests`, { headers, multipart: form });
    expect(created.status(), await created.text()).toBe(201);
    const body = (await created.json()).data;
    requestId = body.id;
    const access = { ...headers, "x-payment-access": body.paymentAccess.token };
    const summary = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: access })).json()).data;
    expect(summary.total ?? summary.amount ?? "1590").toBeTruthy();
    const receipt = await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, { headers: access, multipart: { settlementAccountId: accountId, invoiceVersion: String(summary.invoiceVersion), file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(receipt.status(), await receipt.text()).toBe(201);
    expect((await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers, data: {} })).ok()).toBeTruthy();
    const detail = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    for (const document of detail.documents.filter((d: { status: string; classification: string }) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
      expect((await admin.request.patch(`${BACKEND}/api/contact-requests/${requestId}/documents/${document.id}/status`, { headers, data: { status: "ACCEPTED" } })).ok()).toBeTruthy();
    }
    expect((await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/start-execution`, { headers, data: {} })).ok()).toBeTruthy();

    // An unrelated customer with a request of their own (so they can sign in).
    const theirs = new FormData();
    for (const [key, value] of Object.entries({
      name: `عميل آخر ${stamp}`, phone: otherPhone, message: "طلب عمرة آخر", serviceId: packageId, acceptedTotal: "795", acceptedCurrency: "SAR",
      guarantorPhone: "+966 50 555 6666",
      travelers: JSON.stringify([{ fullName: `معتمر آخر ${stamp}`, isPrimary: true }]),
      documentLabels: JSON.stringify(["إقامة الضامن", "جواز المعتمر"]), documentRequirementIds: JSON.stringify([residence.id, passport.id]), documentTravelerIndexes: JSON.stringify(["", "0"]),
    })) theirs.append(key, value);
    for (const name of ["residence.png", "passport.png"]) theirs.append("documents", new Blob([PNG], { type: "image/png" }), name);
    const other = await admin.request.post(`${BACKEND}/api/contact-requests`, { headers, multipart: theirs });
    expect(other.status(), await other.text()).toBe(201);
    travelers = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data.travelers;
  });

  test.afterAll(async () => {
    if (accountId) await admin.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { headers, data: { active: false } }).catch(() => undefined);
    if (packageId) await admin.request.patch(`${BACKEND}/api/services/${packageId}`, { headers, data: { active: false } }).catch(() => undefined);
    await admin?.context().close();
  });

  const publishVisaInUi = async (page: Page, traveler: { id: string; fullName: string }, remaining: string | null) => {
    await page.goto(`/admin/cases?requestId=${requestId}`);
    await page.getByRole("button", { name: "سير العمل" }).click();
    const workflow = page.getByTestId("case-workflow");
    const form = workflow.getByTestId("workflow-deliverable");
    await form.locator('input[name="label"]').fill(`تأشيرة ${traveler.fullName}`, { timeout: 20_000 });
    await form.locator('input[name="file"]').setInputFiles({ name: "visa.pdf", mimeType: "application/pdf", buffer: PDF });
    await form.locator(`input[name="travelerIds"][value="${traveler.id}"]`).check();
    await form.getByRole("button", { name: "رفع" }).click();
    const confirm = workflow.getByTestId("publish-confirm");
    await expect(confirm.getByTestId("publish-confirm-travelers")).toHaveText(`يخص: ${traveler.fullName}`);
    await expect(confirm.getByTestId("publish-confirm-preview").locator("iframe")).toBeVisible();
    await expect(confirm.getByTestId("publish-confirm-partial")).toHaveText(
      remaining ? `بعد النشر: تبقى تأشيرة ${remaining}؛ يبقى الطلب مفتوحًا.` : "بعد النشر: تكتمل تأشيرات جميع المعتمرين.",
    );
    await confirm.getByTestId("publish-confirm-submit").click();
    await expect(workflow.getByRole("status")).toContainText("تم نشر الملف للعميل");
  };

  test("staff confirm the first visa (file, pilgrim, what remains); the manager sees one partially issued case", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await publishVisaInUi(page, travelers[0], travelers[1].fullName);
    const row = (await (await page.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(row.status).not.toBe("CLOSED");

    await page.goto("/admin/umrah");
    await page.getByLabel("بحث", { exact: true }).fill(phone);
    await expect(page.locator(`[data-umrah-id="${requestId}"]`)).toBeVisible();
    await expect(page.locator('[data-umrah-alert="PARTIAL_VISAS"] [data-umrah-count]')).toHaveText("1");
    await page.locator('[data-umrah-alert="PARTIAL_VISAS"]').click();
    await expect(page.locator("[data-umrah-id]")).toHaveCount(1);
  });

  test("the customer reads one of two issued and downloads it beside the right pilgrim; another customer cannot", async ({ page, browser }) => {
    await signInToTrack(page, phone);
    const journey = page.getByTestId("umrah-journey");
    await expect(journey).toBeVisible({ timeout: 15_000 });
    await expect(journey.getByTestId("umrah-visa-count")).toHaveText("صدرت تأشيرة واحدة من أصل تأشيرتين.");
    const pilgrims = journey.getByTestId("umrah-pilgrim");
    await expect(pilgrims.nth(0)).toContainText(travelers[0].fullName);
    await expect(pilgrims.nth(0).getByTestId("umrah-visa-state")).toHaveText("صدرت التأشيرة");
    await expect(pilgrims.nth(1).getByTestId("umrah-visa-state")).not.toHaveText("صدرت التأشيرة");
    const link = pilgrims.nth(0).getByRole("link").or(pilgrims.nth(0).getByRole("button", { name: new RegExp(travelers[0].fullName) })).first();
    await expect(link).toBeVisible();
    await expect(pilgrims.nth(1).getByRole("link")).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    // The file itself, through the customer's own session.
    const mine = (await (await page.request.get(`${BACKEND}/api/tracking/requests`)).json()).data as Array<{ id: string; progress?: { umrah?: { pilgrims: Array<{ id: string; visaFiles: Array<{ id: string }> }> } } }>;
    const request = mine.find((r) => r.id === requestId);
    const fileId = request?.progress?.umrah?.pilgrims.find((p) => p.id === travelers[0].id)?.visaFiles[0]?.id;
    expect(fileId, JSON.stringify(request).slice(0, 300)).toBeTruthy();
    expect(request?.progress?.umrah?.pilgrims.find((p) => p.id === travelers[1].id)?.visaFiles).toEqual([]);
    const own = await page.request.get(`${BACKEND}/api/tracking/requests/${requestId}/deliverables/${fileId}/file`);
    expect(own.status()).toBe(200);
    expect((await own.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // An unrelated customer (their own phone and session) cannot read it.
    const other = await (await browser.newContext()).newPage();
    await signInToTrack(other, otherPhone);
    await expect(other.getByTestId("umrah-journey").first()).toBeVisible({ timeout: 15_000 });
    const theirs = await other.request.get(`${BACKEND}/api/tracking/requests/${requestId}/deliverables/${fileId}/file`);
    expect([403, 404]).toContain(theirs.status());
    const anonymous = await (await browser.newContext()).request.get(`${BACKEND}/api/tracking/requests/${requestId}/deliverables/${fileId}/file`);
    expect([401, 403, 404]).toContain(anonymous.status());
    await other.context().close();
  });

  test("the second visa completes the group; the case is no longer partial", async ({ page }) => {
    await loginAsSeededAdmin(page);
    await publishVisaInUi(page, travelers[1], null);
    const focus = (await (await page.request.get(`${BACKEND}/api/contact-requests/umrah-focus?search=${encodeURIComponent(phone)}`)).json()).data;
    expect(focus.counts.PARTIAL_VISAS).toBe(0);

    await signInToTrack(page, phone);
    const journey = page.getByTestId("umrah-journey");
    await expect(journey.getByTestId("umrah-visa-count")).toHaveText("صدرت جميع التأشيرات (تأشيرتان).", { timeout: 15_000 });
    await expect(journey.getByTestId("umrah-visa-state")).toHaveText(["صدرت التأشيرة", "صدرت التأشيرة"]);
  });
});
