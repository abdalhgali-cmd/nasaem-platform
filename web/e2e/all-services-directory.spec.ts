import { test, expect } from "@playwright/test";

const API = process.env.E2E_API_URL || "http://localhost:5000/api";
const APP = process.env.E2E_APP_URL || "http://localhost:8081";
test("the website directory opens each published service through its own route", async ({ page }) => {
  await page.goto("/services");
  for (const href of ["/umrah", "/visas/egypt-security-approval", "/flights", "/ferries", "/services/work-visa", "/services/tasheel"]) {
    await expect(page.locator(`#services a[href="${href}"]`)).toHaveCount(1);
  }
  // Hotels are postponed (owner decision 2026-11-11): published, but not listed.
  await expect(page.locator('#services a[href="/hotels"]')).toHaveCount(0);
  const hrefs = await page.locator("#services a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("Tasheel is found in the service catalog rather than the Umrah packages", async ({ page }) => {
  await page.goto("/services/tasheel");
  await expect(page.getByRole("heading", { name: "الخدمة المختارة", exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("intake-option-name")).toHaveCount(1);
  await expect(page.getByTestId("intake-option-name")).toContainText("تساهيل");
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await expect(page.getByPlaceholder("اسمك الكامل")).toBeVisible();
  await page.getByPlaceholder("اسمك الكامل").fill("TEST موعد تجريبي");
  await page.locator('input[type="tel"]').first().fill("0900000001");
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await expect(page.getByRole("heading", { name: "بيانات المتقدمين", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "التالي", exact: true })).toBeDisabled();
  await page.locator('input[type="number"]').fill("2");
  await page.getByPlaceholder("اسم المسافر 1", { exact: true }).fill("TEST متقدم أول");
  await page.getByPlaceholder("اسم المسافر 2", { exact: true }).fill("TEST متقدم ثان");
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  const catalog = (await (await page.request.get(`${API}/services/public`)).json()).data;
  const service = catalog.services.find((item: { code: string }) => item.code === "SVC-TASHEEL");
  const requirements = (await (await page.request.get(`${API}/services/${service.id}/requirements/public`)).json()).data;
  await expect(page.getByRole("button", { name: "التالي", exact: true })).toBeDisabled();
  for (const requirement of requirements.filter((r: { attachmentType: string; required: boolean }) => r.required && r.attachmentType?.startsWith("tasheel_"))) {
    const input = page.locator(`#answer-${requirement.id}`);
    if (requirement.type === "SELECT") await input.selectOption("FAMILY_VISIT");
    else await input.fill(requirement.attachmentType === "tasheel_center_city" ? "TEST القاهرة" : "TEST مصر");
  }
  await expect(page.getByRole("button", { name: "التالي", exact: true })).toBeEnabled();
  // A preferred date is optional and does not confirm an appointment.
  await page.getByRole("button", { name: "التالي", exact: true }).click();
  await expect(page.getByText("TEST متقدم ثان", { exact: false }).first()).toBeVisible();
});

test("a work-visa service page loads the linked VisaType checklist", async ({ page }) => {
  const catalog = (await (await page.request.get(`${API}/services/public`)).json()).data;
  const work = catalog.visaTypes.find((item: { code: string }) => item.code === "VISA-WORK");
  const checklist = page.waitForResponse(response => response.url().includes(`/visa-types/${work.id}/requirements/public`));
  await page.goto("/services/work-visa");
  expect((await checklist).ok()).toBeTruthy();
  await expect(page.locator("main").getByText("عقد العمل").first()).toBeVisible();
});

test("the app directory uses the VisaType once and opens its passport checklist at phone width", async ({ page }) => {
  const catalog = (await (await page.request.get(`${API}/services/public`)).json()).data;
  const work = catalog.visaTypes.find((item: { code: string }) => item.code === "VISA-WORK");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}/index.html`);
  const guest = page.locator("#continueAsGuest");
  await guest.or(page.locator(".hc-top")).first().waitFor();
  if (await guest.isVisible()) await guest.click();
  await page.locator('[data-tab="services"]').click();
  await expect(page.locator(`.svc-card[data-id="${work.id}"]`)).toHaveCount(1);
  await expect(page.locator(`.svc-card[data-id="${work.serviceId}"]`)).toHaveCount(0);
  const checklist = page.waitForResponse(response => response.url().includes(`/visa-types/${work.id}/requirements/public`));
  await page.locator(`.svc-card[data-id="${work.id}"]`).click();
  expect((await checklist).ok()).toBeTruthy();
  await page.getByRole("button", { name: "راجع المتطلبات وابدأ الطلب", exact: true }).click();
  await expect(page.locator('[name="t_name_0"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});
