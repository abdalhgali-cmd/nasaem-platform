import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// Umrah on the website against the real backend, as its own section:
// package (fixed price set in the admin) → applicant → trip → pilgrim →
// documents (passport + guarantor residence, no personal photo) → summary
// with the final price → payment straight away (amount, the agency account,
// receipt) → confirmation with the request number and «بانتظار مراجعة
// التحويل». The receipt never marks the request paid; staff confirm it.

const BACKEND = process.env.E2E_BACKEND_URL || "http://localhost:5000";
const FIXTURE = path.join(__dirname, "fixtures", "sample-document.png");

// Issue #99: the three package types, each from the package card to the
// delivery: visa only («جارٍ إصدار التأشيرة»), flight and sea services
// («جارٍ إصدار التذاكر»). Two pilgrims, the guarantor's phone required.
const KINDS = [
  { kind: "VISA_ONLY", label: "تأشيرة فقط", included: "إصدار تأشيرة العمرة", execution: "جارٍ إصدار التأشيرة" },
  { kind: "AIR", label: "مع خدمات الطيران", included: "تذاكر الطيران", execution: "جارٍ إصدار التذاكر" },
  { kind: "SEA", label: "مع خدمات البحر", included: "تذاكر العبّارة", execution: "جارٍ إصدار التذاكر" },
] as const;

type CatalogFixtures = { services: string[]; accounts: string[] };
const catalogFixtures = new Map<string, CatalogFixtures>();

// Hooks have a separate teardown budget, including when the journey timed out.
// Restore every fixture; one failed request must not leave the rest published.
test.afterEach(async ({ page }, testInfo) => {
  const created = catalogFixtures.get(testInfo.testId);
  if (!created) return;
  await loginAsSeededAdmin(page);
  const changes = [
    ...created.accounts.map((id) => page.request.patch(`${BACKEND}/api/payment-accounts/${id}`, { data: { active: false } })),
    ...created.services.map((id) => page.request.patch(`${BACKEND}/api/services/${id}`, { data: { active: false } })),
  ];
  const results = await Promise.allSettled(changes);
  const failed = results.flatMap((r, index) => r.status === "rejected" ? [`fixture ${index}: request failed`] : r.value.ok() ? [] : [`fixture ${index}: HTTP ${r.value.status()}`]);
  catalogFixtures.delete(testInfo.testId);
  expect(failed, "all Umrah catalog fixtures restored").toEqual([]);
});

for (const type of KINDS) test(`Umrah ${type.kind}: package → pilgrims + guarantor → fixed total → payment → receipt under review → ${type.execution} → delivery`, async ({ page }, testInfo) => {
  // Two actors, two pilgrims, payment review, visa downloads and the optional
  // booking plus fixture cleanup belong to one complete journey.
  test.setTimeout(90_000);
  await loginAsSeededAdmin(page);
  const admin = page.request;
  const stamp = `${Date.now()}`.slice(-8);
  const code = `E2E-UMRAH-PAY-${type.kind}-${stamp}`;
  const packageName = `باقة عمرة ${type.label} E2E ${stamp}`;
  const customer = `معتمر اختبار ${stamp}`;
  const accountNumber = `E2EUMR${stamp}`;
  const created: CatalogFixtures = { services: [], accounts: [] };
  catalogFixtures.set(testInfo.testId, created);

  const pkg = await admin.post(`${BACKEND}/api/services`, {
    data: {
      code, name: packageName, category: "UMRAH_PACKAGE", basePrice: 1250, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER",
      features: [`KIND: ${type.kind}`, `INCLUDED: ${type.included}`, "EXCLUDED: السكن"],
    },
  });
  expect(pkg.ok(), await pkg.text()).toBeTruthy();
  const packageId = (await pkg.json()).data.id as string;
  created.services.push(packageId);
  // A new Umrah package inherits «إقامة الضامن» on its own; only the passport is added here.
  const inherited = (await (await admin.get(`${BACKEND}/api/services/${packageId}/requirements/public`)).json()).data as Array<{ name: string }>;
  expect(inherited.map((r) => r.name)).toEqual(["إقامة الضامن"]);
  const passport = await admin.post(`${BACKEND}/api/services/${packageId}/requirements`, { data: { name: "صورة الجواز ساري المفعول", scope: "TRAVELER", type: "DOCUMENT", required: true } });
  expect(passport.ok(), await passport.text()).toBeTruthy();
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

  await test.step("customer and staff complete the Umrah journey", async () => {
    await page.goto(`/umrah?package=${code}`);
    await expect(page.getByRole("heading", { name: "اختر الباقة", exact: true })).toBeVisible({ timeout: 15_000 });
    const card = page.locator("button").filter({ hasText: packageName });
    await expect(card).toBeVisible();
    // The card: type, the exact fixed price per pilgrim, what is and is not included.
    await expect(card.getByTestId("package-kind")).toHaveText(type.label);
    await expect(card.getByTestId("package-price")).toHaveText("السعر: 1,250 SAR للمعتمر");
    await expect(card.getByTestId("package-included")).toContainText(type.included);
    await expect(card.getByTestId("package-excluded")).toContainText("السكن");
    await expect(card).not.toContainText("يبدأ من");
    await page.getByRole("button", { name: "التالي" }).click();

    // Applicant and guarantor first, then the trip, then the pilgrims.
    await page.getByPlaceholder("اسمك الكامل").fill(customer);
    await page.getByPlaceholder("+249 9XX XXX XXX").fill(`+2499${stamp}`);
    const next = page.getByRole("button", { name: "التالي" });
    await expect(next, "the guarantor's phone is required").toBeDisabled();
    await page.getByTestId("umrah-guarantor-phone").fill("+966 50 123 4567");
    await page.getByTestId("umrah-extra-contact-name").fill("قريب المعتمر");
    await page.getByTestId("umrah-extra-contact-phone").fill("0912345678");
    await next.click();
    await expect(page.getByRole("heading", { name: "متى ترغب في أداء العمرة؟" })).toBeVisible();
    await page.locator('input[type="number"]').fill("2");
    // Preferred travel date: provisional, required for flight/sea, optional for visa only.
    await expect(page.getByTestId("wizard-travel-date-note")).toHaveText("تاريخ مبدئي وليس حجزًا مؤكدًا.");
    const preferredDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    if (type.kind === "VISA_ONLY") {
      await expect(page.getByRole("button", { name: "التالي" })).toBeEnabled();
    } else {
      await expect(page.getByRole("button", { name: "التالي" })).toBeDisabled();
      await page.getByTestId("wizard-travel-date").fill(preferredDate);
      await expect(page.getByRole("button", { name: "التالي" })).toBeEnabled();
    }
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByPlaceholder("اسم المسافر 1").fill(customer);
    await page.getByPlaceholder("اسم المسافر 2").fill(`${customer} الثاني`);
    await page.getByRole("button", { name: "التالي" }).click();

    // Documents from the admin checklist: passport + guarantor residence, no personal photo.
    await expect(page.getByText("إقامة الضامن").first()).toBeVisible();
    await expect(page.getByText("الصورة الشخصية")).toHaveCount(0);
    // each pilgrim's passport + the guarantor's residence
    for (let i = 0; i < 3; i += 1) {
      await page.locator('label:has-text("اختر ملفًا") input[type="file"]').first().setInputFiles(FIXTURE);
    }
    await expect(page.locator('[data-testid="draft-doc"][data-status="uploaded"]')).toHaveCount(3);
    const documentIds = await page.getByTestId("draft-doc").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-document-id")).sort());
    await page.reload();
    await page.getByRole("button", { name: "متابعة الطلب", exact: true }).click();
    await expect(page.locator('[data-testid="draft-doc"][data-status="uploaded"]')).toHaveCount(3);
    expect(await page.getByTestId("draft-doc").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-document-id")).sort())).toEqual(documentIds);
    await page.getByRole("button", { name: "التالي" }).click();

    // Summary with the final price; going back keeps what was entered.
    await expect(page.getByTestId("fixed-total")).toHaveText("2,500 SAR");
    await page.getByRole("button", { name: "السابق" }).click();
    await page.getByRole("button", { name: "التالي" }).click();
    await expect(page.getByText(customer).first()).toBeVisible();
    await expect(page.getByTestId("review-guarantor-phone")).toContainText("+966 50 123 4567");
    const send = page.getByRole("button", { name: "تأكيد ومتابعة إلى الدفع" });
    await expect(send).toBeDisabled();
    await page.getByTestId("confirm-fixed-total").check();
    // The request is made either from the stored draft (resumable intake) or by the classic one-request post.
    const submitted = page.waitForResponse((r) => (r.url().endsWith("/api/contact-requests") || r.url().endsWith("/api/intake-drafts/current/submit")) && r.request().method() === "POST");
    await send.dblclick();
    expect((await submitted).status()).toBe(201);
    await expect(page.getByTestId("payment-step")).toBeVisible({ timeout: 15_000 });

    // A refresh during the payment step: back to the same request's payment,
    // no form to resend, no second request.
    await page.reload();
    await expect(page.getByTestId("payment-resumed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("لديك طلب غير مكتمل")).toHaveCount(0);
    expect(await requestsFor(), "a refresh never creates a second request").toHaveLength(1);

    // Payment straight away: amount, the agency account in SAR, receipt.
    const step = page.getByTestId("payment-step");
    await expect(step.getByTestId("payment-amount")).toHaveText("2,500 SAR", { timeout: 15_000 });
    await expect(step.getByTestId("payment-account").filter({ hasText: accountNumber })).toContainText("بنك العمرة للاختبار");
    await step.getByTestId("payment-account").filter({ hasText: accountNumber }).getByRole("radio").check();
    await step.getByTestId("payment-receipt-input").setInputFiles(FIXTURE);
    const uploaded = page.waitForResponse((r) => r.url().includes("/payment-access/receipt"));
    await step.getByRole("button", { name: "إرسال الطلب للمراجعة" }).click();
    expect((await uploaded).status()).toBe(201);

    await expect(page.getByRole("heading", { name: "تم استلام طلبك", exact: true })).toBeVisible();
    await expect(page.getByTestId("payment-status")).toHaveText("بانتظار مراجعة الدفع");
    // Finished: a later refresh shows the form again, not the old payment.
    await page.reload();
    await expect(page.getByTestId("payment-step")).toHaveCount(0);

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

    // Staff Umrah queue: the request shows its next step, receipt review first.
    await page.goto("/admin/cases");
    await page.getByTestId("case-service-filter").selectOption("UMRAH");
    const queueRow = page.getByRole("button").filter({ hasText: customer });
    await expect(queueRow.getByTestId("case-next-action")).toHaveText("الخطوة التالية: مراجعة إيصال الدفع وتأكيده", { timeout: 15_000 });

    const confirmed = await admin.post(`${BACKEND}/api/contact-requests/${found[0].id}/confirm-payment`, { data: {} });
    expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
    const after = (await (await admin.get(`${BACKEND}/api/contact-requests/${found[0].id}`)).json()).data;
    expect(after.paymentStatus).toBe("CONFIRMED");
    expect(after.intakeData.umrahContacts).toEqual({ guarantorPhone: "+966 50 123 4567", extraContact: { name: "قريب المعتمر", phone: "0912345678" } });
    expect(after.travelers).toHaveLength(2);
    if (type.kind === "VISA_ONLY") expect(after.intakeData.umrahTravel).toBeUndefined();
    else expect(after.intakeData.umrahTravel).toEqual({ preferredDate, provisional: true });

    // Execution and delivery: documents accepted, execution started with the
    // type's wording, each pilgrim's final file published → completed.
    const id = found[0].id;
    for (const document of after.documents as Array<{ id: string; classification: string | null }>) {
      if (document.classification === "FINANCIAL_DOCUMENT") continue;
      const reviewed = await admin.patch(`${BACKEND}/api/contact-requests/${id}/documents/${document.id}/status`, { data: { status: "ACCEPTED" } });
      expect(reviewed.ok(), await reviewed.text()).toBeTruthy();
    }
    const started = await admin.post(`${BACKEND}/api/contact-requests/${id}/start-execution`, { data: {} });
    expect(started.ok(), await started.text()).toBeTruthy();
    expect((await started.json()).data.progress.label).toBe(type.execution);
    const upload = (label: string, travelerIds: string[], kind?: "SERVICE") => admin.post(`${BACKEND}/api/contact-requests/${id}/deliverables`, {
      multipart: {
        label,
        travelerIds: JSON.stringify(travelerIds),
        publish: "true",
        ...(kind ? { kind } : {}),
        file: { name: "final.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") },
      },
    });
    const pilgrims = after.travelers as Array<{ id: string; fullName: string }>;
    // One pilgrim's visa first: the group is not done.
    const firstVisa = await upload(`التأشيرة — ${pilgrims[0].fullName}`, [pilgrims[0].id]);
    expect(firstVisa.ok(), await firstVisa.text()).toBeTruthy();
    expect((await firstVisa.json()).data.kind).toBe("VISA");

    // «رحلتي إلى الحرمين» on the website, as the customer.
    const phone = `+2499${stamp}`;
    await page.context().clearCookies();
    await page.goto("/track");
    await page.locator("#phone").fill(phone);
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.locator("#code").fill(readTrackingLoginCode(phone.replace(/\D/g, "")));
    await page.getByRole("button", { name: "تأكيد" }).click();
    const journey = page.getByTestId("umrah-journey");
    await expect(journey).toBeVisible({ timeout: 15_000 });
    await expect(journey.getByTestId("umrah-reference")).toHaveText(id);
    await expect(journey.getByTestId("umrah-stages").locator("li")).toHaveCount(7);
    await expect(journey.locator('[aria-current="step"]')).toContainText("إصدار التأشيرات");
    await expect(journey.getByTestId("umrah-now-message")).toHaveText("لا يوجد إجراء مطلوب منك حالياً. سنُحدّث حالة طلبك عند اكتمال الخطوة التالية.");
    await expect(journey.getByTestId("umrah-visa-state")).toHaveText(["صدرت التأشيرة", "قيد الإجراءات"]);
    await expect(journey.getByTestId("umrah-file")).toHaveCount(1);
    const visaDownload = await page.request.get(await journey.getByTestId("umrah-file").getAttribute("href") as string);
    expect(visaDownload.status(), "the customer downloads their own visa").toBe(200);
    await expect(journey.getByTestId("umrah-action")).toHaveText("تحميل التأشيرة");
    if (type.kind === "VISA_ONLY") await expect(journey.locator('[data-state="not_included"]')).toContainText("تسليم الخدمات المشمولة");

    // Back to staff for the rest.
    await loginAsSeededAdmin(page);
    const secondVisa = await upload(`التأشيرة — ${pilgrims[1].fullName}`, [pilgrims[1].id]);
    expect(secondVisa.ok(), await secondVisa.text()).toBeTruthy();
    if (type.kind !== "VISA_ONLY") {
      const pending = (await (await admin.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
      expect(pending.status, "a services package is not complete at the visas").not.toBe("CLOSED");
      const services = await upload("تذاكر وسكن المجموعة", pilgrims.map((p) => p.id), "SERVICE");
      expect(services.ok(), await services.text()).toBeTruthy();
    }
    const done = (await (await admin.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(done.status).toBe("CLOSED");
    expect(done.outcome).toBe("COMPLETED");
    await page.reload();
    const booking = page.getByTestId("umrah-ticket-booking");
    if (type.kind !== "VISA_ONLY") {
      // A flight or sea package already delivered its tickets as services:
      // never offer to book (and price) them a second time.
      await expect(page.getByTestId("umrah-journey")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("umrah-status")).toBeVisible();
      await expect(booking).toHaveCount(0);
      const parent = (await (await admin.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
      expect(parent.linkedRequests.filter((r: { linkKind: string }) => r.linkKind === "UMRAH_TICKET")).toHaveLength(0);
      return;
    }
    // Visa only: booking is optional and follows the visas; it never gates completion.
    await expect(booking).toBeVisible();
    await booking.getByRole("button", { name: /طلب حجز تذاكر/ }).click();
    await expect(booking).toContainText("أُرسل طلب الحجز إلى الوكالة");
    const linked = (await (await admin.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data.linkedRequests.filter((r: { linkKind: string }) => r.linkKind === "UMRAH_TICKET");
    expect(linked).toHaveLength(1);
    const inquiry = (await (await admin.get(`${BACKEND}/api/contact-requests/${linked[0].id}`)).json()).data;
    expect(inquiry.pricingMode).toBe("QUOTE");
    expect(inquiry.invoice).toBeNull();
  });
});
