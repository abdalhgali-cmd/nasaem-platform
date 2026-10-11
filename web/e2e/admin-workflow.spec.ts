import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

// The Next.js admin pages that carry the request workflow, in a real
// browser against the real backend: /admin/cases («سير العمل»),
// /admin/payment-review and /admin/delivery, plus the public /track page
// on a closed request. Fixtures are labelled TEST-WF; the visa type and its
// requirement are created for this run and switched off afterwards.

const BACKEND = "http://localhost:5000";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
const localPhone = () => `09${unique().slice(-8)}`;
const normalized = (phone: string) => `249${phone.slice(1)}`;

let visaTypeId = "";
let requirementId = "";

async function staffApi(page: Page): Promise<APIRequestContext> {
  await loginAsSeededAdmin(page);
  return page.request;
}

async function trackingToken(api: APIRequestContext, phone: string) {
  const requested = await api.post(`${BACKEND}/api/tracking/request-code`, { data: { phone } });
  expect(requested.ok(), await requested.text()).toBeTruthy();
  const verified = await api.post(`${BACKEND}/api/tracking/verify-code`, { data: { phone, code: readTrackingLoginCode(normalized(phone)) } });
  expect(verified.ok(), await verified.text()).toBeTruthy();
  return (await verified.json()).data.token as string;
}

async function createRequest(api: APIRequestContext, phone: string, names: string[], withDocsFor: number[]) {
  const form = new FormData();
  form.set("name", names[0]);
  form.set("phone", phone);
  form.set("message", "TEST-WF طلب");
  form.set("visaTypeId", visaTypeId);
  form.set("travelers", JSON.stringify(names.map((fullName, index) => ({ fullName, isPrimary: index === 0 }))));
  form.set("documentLabels", JSON.stringify(withDocsFor.map((i) => `جواز ${names[i]}`)));
  form.set("documentRequirementIds", JSON.stringify(withDocsFor.map(() => requirementId)));
  form.set("documentTravelerIndexes", JSON.stringify(withDocsFor.map(String)));
  for (const i of withDocsFor) form.append("documents", new Blob([PDF], { type: "application/pdf" }), `passport-${i}.pdf`);
  const res = await api.post(`${BACKEND}/api/contact-requests`, { multipart: form });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data.id as string;
}

async function asCustomer(api: APIRequestContext, token: string, method: "post", path: string, options: Record<string, unknown> = {}) {
  return api[method](`${BACKEND}/api/tracking${path}`, { headers: { Authorization: `Bearer ${token}` }, ...options });
}

async function priceApproveReceipt(api: APIRequestContext, token: string, id: string) {
  expect((await api.post(`${BACKEND}/api/contact-requests/${id}/invoice`, { data: { amount: 300, currency: "USD" } })).ok()).toBeTruthy();
  expect((await asCustomer(api, token, "post", `/requests/${id}/invoice/approve`, { data: {} })).ok()).toBeTruthy();
  const receipt = await asCustomer(api, token, "post", `/requests/${id}/payment-receipt`, {
    multipart: { label: "إثبات الدفع", file: { name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect(receipt.status(), await receipt.text()).toBe(201);
}

async function acceptDocuments(api: APIRequestContext, id: string) {
  const detail = (await (await api.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
  for (const document of detail.documents.filter((d: { status: string; classification: string }) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
    expect((await api.patch(`${BACKEND}/api/contact-requests/${id}/documents/${document.id}/status`, { data: { status: "ACCEPTED" } })).ok()).toBeTruthy();
  }
}

test.describe.serial("Next.js admin: request workflow in /admin/cases, /admin/payment-review and /admin/delivery", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const api = await staffApi(page);
    const created = await api.post(`${BACKEND}/api/visa-types`, {
      data: { code: `TEST-WF-ADMIN-${unique()}`, name: `TEST-WF تأشيرة ${unique()}`, country: "TEST", basePrice: 0, currency: "USD", active: true },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    visaTypeId = (await created.json()).data.id;
    const requirement = await api.post(`${BACKEND}/api/visa-types/${visaTypeId}/requirements`, {
      data: { name: "TEST-WF صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true },
    });
    expect(requirement.ok(), await requirement.text()).toBeTruthy();
    requirementId = (await requirement.json()).data.id;
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    const api = await staffApi(page);
    await api.patch(`${BACKEND}/api/visa-types/${visaTypeId}`, { data: { active: false } });
    await page.close();
  });

  test("/admin/cases «سير العمل»: blockers, document review, execution, per-traveler files, completion, read-only", async ({ page }) => {
    const api = await staffApi(page);
    const phone = localPhone();
    const names = [`TEST-WF أحمد ${unique()}`, `TEST-WF سارة ${unique()}`];
    const id = await createRequest(api, phone, names, [0]);
    const token = await trackingToken(api, phone);
    await priceApproveReceipt(api, token, id);
    expect((await api.post(`${BACKEND}/api/contact-requests/${id}/confirm-payment`, { data: {} })).ok()).toBeTruthy();

    await page.goto(`/admin/cases?requestId=${id}`);
    await page.getByRole("button", { name: "سير العمل" }).click();
    const workflow = page.getByTestId("case-workflow");
    await expect(workflow.getByTestId("workflow-label")).toHaveText("تم قبول الدفع، بانتظار بدء التنفيذ", { timeout: 20_000 });
    const blockers = workflow.getByTestId("workflow-blockers");
    await expect(blockers).toContainText(names[1]);
    await expect(blockers).toContainText("لم تُرفع");
    await expect(blockers).toContainText("بانتظار مراجعة");
    await expect(workflow.getByTestId("workflow-start-execution")).toHaveCount(0);

    // the customer uploads the missing passport; staff accept both in «المستندات»
    const travelers = (await (await api.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data.travelers as { id: string; fullName: string }[];
    const upload = await asCustomer(api, token, "post", `/requests/${id}/documents`, {
      multipart: { label: `جواز ${names[1]}`, requirementId, travelerId: travelers[1].id, file: { name: "p2.pdf", mimeType: "application/pdf", buffer: PDF } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    await page.reload();
    await page.getByRole("button", { name: /^المستندات/ }).click();
    for (const name of names) {
      const row = page.locator("li", { hasText: `جواز ${name}` }).filter({ has: page.getByRole("button", { name: "قبول" }) }).first();
      await row.getByRole("button", { name: "قبول" }).click();
      await expect(page.locator("li", { hasText: `جواز ${name}` }).first()).toContainText("مقبول", { timeout: 15_000 });
    }

    await page.getByRole("button", { name: "سير العمل" }).click();
    await workflow.getByTestId("workflow-start-execution").click();
    await expect(workflow.getByRole("status")).toContainText("تم تسجيل بدء التنفيذ");
    await expect(workflow.getByTestId("workflow-label")).toHaveText("جارٍ استخراج التأشيرة");
    await expect(workflow.locator('[data-step="EXECUTION"]')).toHaveAttribute("data-state", "current");

    const deliver = async (traveler: { id: string; fullName: string }) => {
      const form = workflow.getByTestId("workflow-deliverable");
      await form.locator('input[name="label"]').fill(`الملف النهائي — ${traveler.fullName}`);
      await form.locator('input[name="file"]').setInputFiles({ name: "final.pdf", mimeType: "application/pdf", buffer: PDF });
      await form.locator(`input[name="travelerIds"][value="${traveler.id}"]`).check();
      await expect(form.locator('input[name="publish"]')).toBeChecked();
      await form.getByRole("button", { name: "رفع" }).click();
      await expect(workflow.getByRole("status")).toContainText("تم رفع الملف ونشره");
    };
    await deliver(travelers[0]);
    await expect(workflow.getByTestId("workflow-label")).toHaveText("جارٍ استخراج التأشيرة");
    await expect(workflow).toContainText(`بانتظار ملف منشور لـ: ${names[1]}`);
    await deliver(travelers[1]);
    await expect(workflow.getByTestId("workflow-label")).toHaveText("تم إنجاز طلبك بنجاح");
    await expect(workflow).toContainText("الطلب مغلق وللقراءة فقط");
    await expect(workflow.getByTestId("workflow-deliverable")).toHaveCount(0);
    await expect(workflow.getByTestId("workflow-quote")).toHaveCount(0);
    await expect(workflow.getByRole("button", { name: "إعادة فتح" })).toBeVisible();
  });

  test("/admin/payment-review: reject a customer-request receipt with a reason, then accept the new one; /admin/delivery finishes it", async ({ page }) => {
    const api = await staffApi(page);
    const phone = localPhone();
    const name = `TEST-WF دفع ${unique()}`;
    const id = await createRequest(api, phone, [name], [0]);
    await acceptDocuments(api, id);
    const token = await trackingToken(api, phone);
    await priceApproveReceipt(api, token, id);

    await page.goto("/admin/payment-review");
    const item = page.locator("article", { hasText: name });
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.getByRole("button", { name: "رفض" }).click();
    await item.getByPlaceholder("سبب رفض الدفعة (سيصل للعميل)").fill("TEST-WF المبلغ غير مطابق");
    await item.getByRole("button", { name: "تأكيد الرفض" }).click();
    await expect(page.getByText(/تم رفض الدفعة/)).toBeVisible({ timeout: 15_000 });
    let detail = (await (await api.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(detail.paymentStatus).toBe("AWAITING_TRANSFER");
    expect(detail.paymentRejectionReason).toBe("TEST-WF المبلغ غير مطابق");

    const again = await asCustomer(api, token, "post", `/requests/${id}/payment-receipt`, {
      multipart: { label: "إثبات الدفع", file: { name: "receipt2.pdf", mimeType: "application/pdf", buffer: PDF } },
    });
    expect(again.status()).toBe(201);
    await page.reload();
    await page.locator("article", { hasText: name }).getByRole("button", { name: /تأكيد الدفع/ }).click();
    await expect(page.getByText(/تم تأكيد الدفع/)).toBeVisible({ timeout: 15_000 });
    detail = (await (await api.get(`${BACKEND}/api/contact-requests/${id}`)).json()).data;
    expect(detail.paymentStatus).toBe("CONFIRMED");

    // /admin/delivery uses the same workflow panel
    await page.goto(`/admin/delivery?requestId=${id}`);
    const workflow = page.getByTestId("case-workflow");
    await workflow.getByTestId("workflow-start-execution").click({ timeout: 20_000 });
    await expect(workflow.getByTestId("workflow-label")).toHaveText("جارٍ استخراج التأشيرة");
    const form = workflow.getByTestId("workflow-deliverable");
    await form.locator('input[name="label"]').fill("التأشيرة الصادرة");
    await form.locator('input[name="file"]').setInputFiles({ name: "visa.pdf", mimeType: "application/pdf", buffer: PDF });
    await form.getByRole("button", { name: "رفع" }).click();
    await expect(workflow.getByTestId("workflow-label")).toHaveText("تم إنجاز طلبك بنجاح", { timeout: 15_000 });
  });

  test("website /track: a cancelled request offers no approval; a stale approval is refused in Arabic", async ({ page }) => {
    const api = await staffApi(page);
    const phone = localPhone();
    const first = await createRequest(api, phone, [`TEST-WF ملغى ${unique()}`], [0]);
    const second = await createRequest(api, phone, [`TEST-WF قديم ${unique()}`], [0]);
    for (const id of [first, second]) {
      expect((await api.post(`${BACKEND}/api/contact-requests/${id}/invoice`, { data: { amount: 120, currency: "USD" } })).ok()).toBeTruthy();
    }
    expect((await api.patch(`${BACKEND}/api/contact-requests/${first}/status`, { data: { status: "CLOSED", outcome: "CANCELLED", outcomeNote: "TEST-WF" } })).ok()).toBeTruthy();

    await page.goto("/track");
    await page.locator("#phone").fill(`+${normalized(phone)}`);
    await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
    await page.locator("#code").fill(readTrackingLoginCode(normalized(phone)));
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("تم إلغاء الطلب").first()).toBeVisible({ timeout: 15_000 });
    // only the open request offers approval
    await expect(page.getByRole("button", { name: "موافقة على السعر" })).toHaveCount(1);

    // staff cancel the second one while the page is open; the click is refused with the server's Arabic reason
    expect((await api.patch(`${BACKEND}/api/contact-requests/${second}/status`, { data: { status: "CLOSED", outcome: "CANCELLED", outcomeNote: "TEST-WF" } })).ok()).toBeTruthy();
    await page.getByRole("button", { name: "موافقة على السعر" }).click();
    await expect(page.getByText("هذا الطلب مغلق ولا يقبل إجراءات جديدة", { exact: false })).toBeVisible({ timeout: 15_000 });
    const detail = (await (await api.get(`${BACKEND}/api/contact-requests/${second}`)).json()).data;
    expect(detail.paymentStatus).toBe("NOT_REQUIRED");
    expect(detail.invoice.status).toBe("PENDING");
  });
});
