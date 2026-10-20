import { expect, test, type Route } from "@playwright/test";

// /track at phone width (360px) against a mocked tracking API — the cases the
// real backend cannot be steered into on demand:
//  1. A USD invoice payable in USD or in its frozen SDG equivalent: the
//     customer picks the SDG account (the invoice stays 85 USD), picks a PDF,
//     the server answers INVOICE_CHANGED (the options are reloaded, the PDF
//     stays picked), then the connection drops («إعادة المحاولة»), then the
//     receipt is accepted with the chosen account and the current invoice
//     version → «بانتظار مراجعة الدفع», never paid.
//  2. The Egypt approval section: the server's timeline with the current
//     stage, the approval (with issue date) and circular files with inline
//     preview and download, no superseded file, and the flight choice.
// The real-backend journeys are website-payment-step.spec.ts and
// payment-recovery.spec.ts.

const API = "http://localhost:5000/api";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

function baseRow(overrides: Record<string, unknown>) {
  return {
    service: "خدمة اختبار",
    serviceRef: null,
    visaType: null,
    travelerCount: 1,
    intakeData: null,
    message: "طلب اختبار",
    status: "CONTACTED",
    statusLabel: "قيد المعالجة",
    createdAt: "2026-10-20T08:00:00.000Z",
    offers: [],
    selectedOfferId: null,
    documents: [],
    checklist: [],
    nextActions: [],
    deliverables: [],
    outcome: null,
    outcomeNote: null,
    paymentRejection: null,
    egypt: null,
    ...overrides,
  };
}

const usdAccount = { accountId: "acc-usd", kind: "INVOICE_CURRENCY", payCurrency: "USD", payAmount: "85", name: "USD", bankName: "بنك الدولار", accountName: "نسائم الحرمين", accountNumber: "USD-0001", iban: "SD00USD0001", currency: "USD" };
const sdgAccount = (amount: string, rate: string) => ({ accountId: "acc-sdg", kind: "SDG_EQUIVALENT", payCurrency: "SDG", payAmount: amount, rate, rateFixedAt: "2026-10-19T10:00:00.000Z", name: "SDG", bankName: "بنك الجنيه", accountName: "نسائم الحرمين", accountNumber: "SDG-0001", iban: null, currency: "SDG" });

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("payment: SDG-equivalent account, PDF receipt, invoice changed, offline retry -> under review", async ({ page }) => {
  let invoiceVersion = 2;
  let sdgAmount = "782000";
  let paymentStatus = "AWAITING_TRANSFER";
  let attempts = 0;
  const bodies: string[] = [];

  await page.route(`${API}/tracking/requests`, (route) => {
    const awaiting = paymentStatus === "AWAITING_TRANSFER";
    return json(route, 200, {
      success: true,
      data: [
        baseRow({
          id: "REQ-PAY-1",
          allowedActions: awaiting ? ["UPLOAD_RECEIPT"] : [],
          invoice: { amount: "85", currency: "USD", description: null, status: "APPROVED", version: invoiceVersion, amountSdg: sdgAmount, exchangeRateToSdg: String(Number(sdgAmount) / 85) },
          paymentStatus,
          paymentSettlementOptions: awaiting ? [usdAccount, sdgAccount(sdgAmount, String(Number(sdgAmount) / 85))] : [],
        }),
      ],
    });
  });
  await page.route(`${API}/tracking/requests/REQ-PAY-1/payment-receipt`, async (route) => {
    attempts += 1;
    bodies.push(route.request().postDataBuffer()?.toString("latin1") ?? "");
    if (attempts === 1) {
      // Staff re-issued the invoice meanwhile.
      invoiceVersion = 3;
      sdgAmount = "800000";
      return json(route, 409, { success: false, code: "INVOICE_CHANGED", message: "تغيّرت بيانات الفاتورة بعد أن فتحت صفحة الدفع؛ حدّث الصفحة ثم ارفع الإشعار." });
    }
    if (attempts === 2) return route.abort("internetdisconnected");
    paymentStatus = "UNDER_REVIEW";
    return json(route, 201, { success: true, message: "تم رفع إشعار الدفع", data: { id: "DOC-1" } });
  });

  await page.goto("/track");
  const step = page.getByTestId("payment-step");
  await expect(step.getByTestId("payment-amount")).toHaveText("85 USD", { timeout: 15_000 });
  await expect(step.getByTestId("payment-amount-sdg")).toContainText("782,000 SDG");
  const usd = step.getByTestId("payment-account").filter({ hasText: "USD-0001" });
  const sdg = step.getByTestId("payment-account").filter({ hasText: "SDG-0001" });
  await expect(usd).toContainText("حوّل 85 USD");
  await expect(usd).toContainText("SD00USD0001");
  await expect(usd.getByRole("button", { name: "نسخ IBAN" })).toBeVisible();
  await expect(sdg).toContainText("حوّل 782,000 SDG");
  await expect(sdg.getByTestId("settlement-sdg-note")).toContainText("فاتورتك الأصلية 85 USD لا تتغيّر");
  // Two ways to pay: nothing preselected.
  await expect(step.getByRole("radio", { checked: true })).toHaveCount(0);
  await sdg.getByRole("radio").check();

  await step.getByTestId("payment-receipt-pdf").setInputFiles({ name: "bank-transfer.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(step.getByTestId("receipt-name")).toHaveText("bank-transfer.pdf");
  await expect(step.getByTestId("receipt-preview")).toContainText("KB");
  const send = step.getByRole("button", { name: "رفع الإيصال للمراجعة" });
  await send.click();

  // 1) INVOICE_CHANGED: the new amount is shown, the account must be chosen
  // again, the PDF is still picked.
  await expect(step.getByTestId("payment-notice")).toContainText("تغيّرت بيانات الفاتورة");
  await expect(sdg).toContainText("حوّل 800,000 SDG");
  await expect(step.getByTestId("receipt-name")).toHaveText("bank-transfer.pdf");
  await expect(step.getByRole("radio", { checked: true })).toHaveCount(0);
  await sdg.getByRole("radio").check();

  // 2) Offline: an Arabic message and «إعادة المحاولة».
  await send.click();
  await expect(step.getByTestId("payment-error")).toContainText("تعذّر الاتصال. تحقق من الإنترنت");
  const retry = step.getByRole("button", { name: "إعادة المحاولة" });
  await expect(retry).toBeEnabled();

  // 3) Accepted: under review, never paid.
  await retry.click();
  await expect(page.getByTestId("payment-under-review")).toContainText("بانتظار مراجعة الدفع", { timeout: 15_000 });
  await expect(page.getByTestId("payment-under-review")).toContainText("لا يُعتبر الطلب مدفوعًا");
  await expect(page.getByTestId("payment-step")).toHaveCount(0);
  expect(attempts).toBe(3);
  expect(bodies[0]).toMatch(/name="settlementAccountId"\r\n\r\nacc-sdg/);
  expect(bodies[0]).toMatch(/name="invoiceVersion"\r\n\r\n2\r\n/);
  expect(bodies[2]).toMatch(/name="settlementAccountId"\r\n\r\nacc-sdg/);
  expect(bodies[2]).toMatch(/name="invoiceVersion"\r\n\r\n3\r\n/);
  expect(bodies[2]).toContain('filename="bank-transfer.pdf"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("payment: no account accepts the invoice currency -> accurate message, tracking stays", async ({ page }) => {
  await page.route(`${API}/tracking/requests`, (route) =>
    json(route, 200, {
      success: true,
      data: [
        baseRow({
          id: "REQ-PAY-2",
          allowedActions: ["UPLOAD_RECEIPT"],
          invoice: { amount: "85", currency: "USD", description: null, status: "APPROVED", version: 1, amountSdg: null },
          paymentStatus: "AWAITING_TRANSFER",
          paymentSettlementOptions: [],
        }),
      ],
    }),
  );
  await page.goto("/track");
  const step = page.getByTestId("payment-step");
  await expect(step.getByTestId("no-payment-account")).toContainText("لا يوجد حاليًا حساب دفع مفعّل يقبل السداد بعملة الفاتورة (USD) أو بمقابلها بالجنيه", { timeout: 15_000 });
  await expect(step.getByTestId("receipt-picker")).toHaveCount(0);
  // The request itself stays on /track to follow.
  await expect(page.getByText("REQ-PAY-2").first()).toBeVisible();
});

test("egypt: timeline, typed files with preview and download, flight choice", async ({ page }) => {
  let flightChoice: string | null = null;
  const flightBodies: unknown[] = [];
  const egypt = () => ({
    entryMode: "AIR",
    route: { entryMode: "AIR", departureCity: "الخرطوم", arrivalAirport: "القاهرة" },
    approval: {
      issued: true,
      issuedOn: "2026-10-18",
      files: [{ id: "appr-1", label: "الموافقة الأمنية — أحمد", fileName: "approval.png", mimeType: "image/png", version: 2, publishedAt: "2026-10-18T09:00:00.000Z", issuedOn: "2026-10-17", travelerIds: [] }],
      missingTravelerIds: [],
    },
    circular: { status: "ISSUED", issuedOn: "2026-10-19", files: [{ id: "circ-1", label: "التعميم", fileName: "circular.pdf", mimeType: "application/pdf", version: 1, publishedAt: "2026-10-19T09:00:00.000Z", issuedOn: "2026-10-19", travelerIds: [] }] },
    tickets: [
      { source: "CUSTOMER", documentId: "doc-own", label: "تذكرتي", status: "PENDING" },
      { source: "STAFF", deliverableId: "tick-old", label: "تذكرة قديمة", version: 1, supersededAt: "2026-10-19T08:00:00.000Z" },
    ],
    travel: { travelDate: "2026-11-02", daysUntil: 13, preparationComplete: false, missing: [{ code: "TICKET_MISSING", message: "تذكرة الطيران لم تُرفع بعد." }], customerCanEdit: false },
    flight: { choice: flightChoice, details: { flightNumber: "SD 345", airline: "سودانير", departureTime: "08:30", arrivalTime: "10:45", source: "CUSTOMER", verifiedAt: null, verified: false }, inquiry: null },
    receipt: { available: true, receiptNo: "RC-2026-0001", status: "READY" },
    timeline: [
      { key: "RECEIVED", label: "تم استلام الطلب", state: "done" },
      { key: "PAYMENT_CONFIRMED", label: "تم تأكيد الدفع", state: "done" },
      { key: "APPROVAL_IN_PROGRESS", label: "جاري إصدار الموافقة", state: "done" },
      { key: "APPROVAL_ISSUED", label: "تم إصدار الموافقة", state: "done" },
      { key: "TRAVEL_PREPARATION", label: "تجهيز بيانات السفر", state: "current" },
      { key: "CIRCULAR_IN_PROGRESS", label: "جاري إصدار التعميم", state: "upcoming" },
      { key: "CIRCULAR_ISSUED", label: "تم إصدار التعميم", state: "upcoming" },
    ],
  });
  await page.route(`${API}/tracking/requests`, (route) =>
    json(route, 200, {
      success: true,
      data: [
        baseRow({
          id: "REQ-EG-1",
          service: "الموافقة الأمنية لمصر",
          allowedActions: flightChoice === "REQUEST" ? [] : ["REQUEST_FLIGHT_BOOKING"],
          invoice: { amount: "120", currency: "USD", description: null, status: "APPROVED", version: 1 },
          paymentStatus: "CONFIRMED",
          paymentSettlementOptions: [],
          deliverables: [
            { id: "appr-1", label: "الموافقة الأمنية — أحمد" },
            { id: "circ-1", label: "التعميم" },
          ],
          egypt: egypt(),
        }),
      ],
    }),
  );
  await page.route(`${API}/tracking/requests/REQ-EG-1/deliverables/appr-1/file`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route(`${API}/tracking/requests/REQ-EG-1/payment-receipt/file`, (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", headers: { "Content-Disposition": 'attachment; filename="RC-2026-0001.pdf"' }, body: PDF }),
  );
  await page.route(`${API}/tracking/requests/REQ-EG-1/egypt/flight`, async (route) => {
    const body = route.request().postDataJSON() as { choice: string };
    flightBodies.push(body);
    flightChoice = body.choice;
    return json(route, 200, { success: true, data: { choice: body.choice } });
  });

  await page.goto("/track");
  const section = page.getByTestId("egypt-journey");
  await expect(section).toBeVisible({ timeout: 15_000 });
  const timeline = section.getByTestId("egypt-timeline");
  await expect(timeline.locator("li")).toHaveCount(7);
  await expect(timeline.locator('li[aria-current="step"]')).toHaveCount(1);
  await expect(timeline.locator('li[aria-current="step"]')).toHaveAttribute("data-step", "TRAVEL_PREPARATION");
  await expect(timeline.locator('li[aria-current="step"]')).toContainText("تجهيز بيانات السفر");
  await expect(timeline.locator('li[data-step="CIRCULAR_IN_PROGRESS"]')).toContainText("جاري إصدار التعميم");
  await expect(section.getByTestId("egypt-approval-issued")).toContainText("2026-10-18");

  const files = section.getByTestId("egypt-file");
  await expect(files).toHaveCount(3);
  await expect(section.getByText("تذكرة قديمة")).toHaveCount(0);
  await expect(section.getByText("تذكرتي")).toHaveCount(0);
  const approval = section.locator('[data-testid="egypt-file"][data-kind="APPROVAL"]');
  // Each file's own issue date (the latest approval date is in the headline).
  await expect(approval.getByTestId("egypt-file-date")).toContainText("تاريخ الإصدار: 2026-10-17");
  await expect(section.locator('[data-testid="egypt-file"][data-kind="CIRCULAR"]').getByTestId("egypt-file-date")).toContainText("تاريخ الإصدار: 2026-10-19");
  await approval.getByRole("button", { name: "معاينة الموافقة الأمنية" }).click();
  await expect(approval.getByTestId("egypt-file-preview")).toBeVisible();
  const download = page.waitForEvent("download");
  await section.locator('[data-testid="egypt-file"][data-kind="RECEIPT"]').getByRole("button", { name: "تحميل إيصال السداد" }).click();
  expect((await download).suggestedFilename()).toBe("RC-2026-0001.pdf");
  // The typed files are not repeated in the generic list.
  await expect(page.getByText("ملفاتك النهائية جاهزة", { exact: true })).toHaveCount(0);

  const flight = section.getByTestId("egypt-flight");
  const details = flight.getByTestId("egypt-flight-details");
  await expect(details).toContainText("SD 345");
  await expect(details).toContainText("سودانير");
  await expect(details).toContainText("08:30");
  await expect(details).toContainText("10:45");
  await expect(details).toContainText("بانتظار تحقق الوكالة");
  await expect(flight.getByRole("button", { name: "لدي تذكرة بالفعل" })).toBeVisible();
  await expect(flight.getByRole("button", { name: "لاحقًا" })).toBeVisible();
  await flight.getByRole("button", { name: "احجزوا لي عبر نسائم" }).click();
  await expect(flight.getByTestId("egypt-flight-choice")).toContainText("طلبت حجز التذكرة عبر نسائم");
  await expect(flight.getByRole("button", { name: "احجزوا لي عبر نسائم" })).toHaveCount(0);
  expect(flightBodies).toEqual([{ choice: "REQUEST" }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
