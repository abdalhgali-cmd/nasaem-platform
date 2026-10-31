import fs from "node:fs";
import path from "node:path";
import { test, expect, request as playwrightRequest, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// Phase 6 — security checks for the Umrah and Egypt flows, against the real
// backend (no mocks): authentication, CSRF origin check, role boundaries for
// payments and service transitions, document and payment-link protection,
// duplicate actions, and the audit trail. Fixtures are deactivated afterwards.

const BACKEND = "http://localhost:5000";
const WEB = "http://localhost:3000";
const PNG = fs.readFileSync(path.join(__dirname, "fixtures", "sample-document.png"));
const PDF = Buffer.from("%PDF-1.4\n%%EOF");
const H = { Origin: WEB };

async function staff(browser: Browser, admin: Page, role: "EMPLOYEE" | "ACCOUNTANT") {
  const email = `sec-${role.toLowerCase()}-${Date.now()}@nasaem-platform.local`;
  const password = "Staff@12345";
  const created = await admin.request.post(`${BACKEND}/api/users`, { headers: H, data: { fullName: `اختبار أمان ${role}`, email, password, role } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const context = await browser.newContext();
  expect((await context.request.post(`${BACKEND}/api/auth/login`, { data: { email, password } })).ok()).toBeTruthy();
  return context;
}

test.describe.serial("security — Umrah and Egypt", () => {
  const stamp = `${Date.now()}`.slice(-8);
  let admin: Page;
  let packageId = "";
  let accountId = "";
  let requestId = "";
  let token = "";
  let documentId = "";

  test.beforeAll(async ({ browser }) => {
    admin = await (await browser.newContext()).newPage();
    await loginAsSeededAdmin(admin);
    const pkg = await admin.request.post(`${BACKEND}/api/services`, { headers: H, data: { code: `E2E-SEC-${stamp}`, name: `باقة اختبار الأمان ${stamp}`, category: "UMRAH_PACKAGE", basePrice: 900, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"] } });
    expect(pkg.ok(), await pkg.text()).toBeTruthy();
    packageId = (await pkg.json()).data.id;
    const residence = ((await (await admin.request.get(`${BACKEND}/api/services/${packageId}/requirements/public`)).json()).data as Array<{ id: string; name: string }>).find((r) => r.name.includes("إقامة"))!;
    const account = await admin.request.post(`${BACKEND}/api/payment-accounts`, { headers: H, data: { name: `E2E SEC ${stamp}`, bankName: "بنك اختبار", accountName: "حساب اختبار", accountNumber: `SEC${stamp}`, currency: "SAR" } });
    accountId = (await account.json()).data.id;
    const form = new FormData();
    for (const [k, v] of Object.entries({ name: `عميل اختبار الأمان ${stamp}`, phone: `0917${stamp.slice(-6)}`, message: "طلب لاختبار الأمان", serviceId: packageId, acceptedTotal: "900", acceptedCurrency: "SAR", guarantorPhone: "+966500000000", travelers: JSON.stringify([{ fullName: "معتمر اختبار الأمان", passportNo: "P9988776", isPrimary: true }]), documentLabels: JSON.stringify(["إقامة الضامن"]), documentRequirementIds: JSON.stringify([residence.id]), documentTravelerIndexes: JSON.stringify([""]) })) form.append(k, v);
    form.append("documents", new Blob([PNG], { type: "image/png" }), "residence.png");
    const created = await admin.request.post(`${BACKEND}/api/contact-requests`, { headers: H, multipart: form });
    expect(created.status(), await created.text()).toBe(201);
    const body = (await created.json()).data;
    requestId = body.id;
    token = body.paymentAccess.token;
    const detail = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    documentId = detail.documents[0].id;
  });

  test.afterAll(async () => {
    await admin.request.patch(`${BACKEND}/api/payment-accounts/${accountId}`, { headers: H, data: { active: false } }).catch(() => undefined);
    await admin.request.patch(`${BACKEND}/api/services/${packageId}`, { headers: H, data: { active: false } }).catch(() => undefined);
    await admin?.context().close();
  });

  test("no session: requests, documents, queues and admin actions are refused", async () => {
    const anon: APIRequestContext = await playwrightRequest.newContext();
    for (const url of [
      `/api/contact-requests`,
      `/api/contact-requests/${requestId}`,
      `/api/contact-requests/${requestId}/documents/${documentId}/file`,
      `/api/contact-requests/egypt/queue`,
      `/api/contact-requests/${requestId}/timeline`,
    ]) expect((await anon.get(`${BACKEND}${url}`)).status(), url).toBe(401);
    expect((await anon.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers: H, data: {} })).status()).toBe(401);
    await anon.dispose();
  });

  test("CSRF: a signed-in admin's change from an untrusted origin is refused and changes nothing", async () => {
    const evil = await admin.request.patch(`${BACKEND}/api/contact-requests/${requestId}/status`, { headers: { Origin: "https://evil.example" }, data: { status: "CONTACTED" } });
    expect(evil.status()).toBe(403);
    const after = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(after.status).toBe("NEW");
  });

  test("payment link: a wrong token reveals nothing and cannot upload", async () => {
    const anon = await playwrightRequest.newContext();
    const bad = { ...H, "x-payment-access": "x".repeat(43) };
    expect((await anon.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: bad })).status()).toBe(404);
    expect((await anon.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, { headers: bad, multipart: { file: { name: "r.pdf", mimeType: "application/pdf", buffer: PDF } } })).status()).toBe(404);
    await anon.dispose();
  });

  test("roles: EMPLOYEE cannot decide payments or reassign; ACCOUNTANT cannot work Egypt/Umrah transitions", async ({ browser }) => {
    const employee = await staff(browser, admin, "EMPLOYEE");
    for (const [url, data] of [["confirm-payment", {}], ["reject-payment", { reason: "اختبار" }]] as const) {
      expect((await employee.request.post(`${BACKEND}/api/contact-requests/${requestId}/${url}`, { headers: H, data })).status(), url).toBe(403);
    }
    expect((await employee.request.patch(`${BACKEND}/api/contact-requests/${requestId}/assign`, { headers: H, data: { assignedUserId: null } })).status()).toBe(403);
    await employee.close();

    const accountant = await staff(browser, admin, "ACCOUNTANT");
    expect((await accountant.request.get(`${BACKEND}/api/contact-requests/egypt/queue`)).status()).toBe(403);
    expect((await accountant.request.post(`${BACKEND}/api/contact-requests/${requestId}/start-execution`, { headers: H, data: {} })).status()).toBe(403);
    expect((await accountant.request.patch(`${BACKEND}/api/contact-requests/${requestId}/documents/${documentId}/status`, { headers: H, data: { status: "ACCEPTED" } })).status()).toBe(403);
    expect((await accountant.request.post(`${BACKEND}/api/contact-requests/${requestId}/notes`, { headers: H, data: { body: "ملاحظة" } })).status()).toBe(403);
    // It may read the request and its documents (payment context).
    expect((await accountant.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).status()).toBe(200);
    await accountant.close();
  });

  test("state rules: no confirmation without a receipt; one confirmation only; audited once with its user", async ({ browser }) => {
    const early = await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers: H, data: {} });
    expect(early.ok(), "a payment cannot be confirmed before a receipt is under review").toBe(false);

    const access = { ...H, "x-payment-access": token };
    const summary = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}/payment-access`, { headers: access })).json()).data;
    const receipt = await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, { headers: access, multipart: { settlementAccountId: accountId, invoiceVersion: String(summary.invoiceVersion), file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(receipt.status(), await receipt.text()).toBe(201);
    const again = await admin.request.post(`${BACKEND}/api/contact-requests/${requestId}/payment-access/receipt`, { headers: access, multipart: { settlementAccountId: accountId, invoiceVersion: String(summary.invoiceVersion), file: { name: "receipt2.pdf", mimeType: "application/pdf", buffer: PDF } } });
    expect(again.ok(), "a second receipt while one is under review is refused").toBe(false);

    const accountant = await staff(browser, admin, "ACCOUNTANT");
    const [first, second] = await Promise.all([
      accountant.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers: H, data: {} }),
      accountant.request.post(`${BACKEND}/api/contact-requests/${requestId}/confirm-payment`, { headers: H, data: {} }),
    ]);
    expect([first.ok(), second.ok()].filter(Boolean), "exactly one of two simultaneous confirmations succeeds").toHaveLength(1);
    await accountant.close();

    const detail = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}`)).json()).data;
    expect(detail.paymentStatus).toBe("CONFIRMED");
    const timeline = (await (await admin.request.get(`${BACKEND}/api/contact-requests/${requestId}/timeline`)).json()).data as Array<{ action: string; user: { role: string } | null }>;
    const confirmations = timeline.filter((e) => /PAYMENT_CONFIRMED/.test(e.action));
    expect(confirmations, JSON.stringify(timeline.map((e) => e.action))).toHaveLength(1);
    expect(confirmations[0].user?.role).toBe("ACCOUNTANT");
  });

  test("customer data: list rows mask passport numbers for staff", async () => {
    const list = (await (await admin.request.get(`${BACKEND}/api/contact-requests?serviceKind=UMRAH&search=${requestId}`)).json()).data;
    const travelers = list[0].travelers as Array<{ passportNo: string | null }>;
    expect(travelers).toHaveLength(1);
    expect(travelers[0].passportNo).toMatch(/^•+776$/);
    expect(JSON.stringify(list[0])).not.toContain("P9988776");
  });
});
