import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// Issue #102: /admin/cases opens the exact request from a link even when it is
// not in the loaded list or the current filters, and filters by payment status
// and date (server-side), against the real backend.

const BACKEND = "http://localhost:5000";

test("/admin/cases: a linked request opens outside the filters; payment and date filters", async ({ page }) => {
  await loginAsSeededAdmin(page);
  const admin = page.request;
  const stamp = `${Date.now()}`.slice(-8);
  const name = `TEST-WF عميل رابط ${stamp}`;
  const created = await admin.post(`${BACKEND}/api/contact-requests`, {
    data: { name, phone: `2499${stamp}`, service: "اختبار الروابط", message: "TEST-WF طلب رابط" },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const id = (await created.json()).data.id as string;
  const invoice = await admin.post(`${BACKEND}/api/contact-requests/${id}/invoice`, { data: { amount: 100, currency: "SAR" } });
  expect(invoice.ok(), await invoice.text()).toBeTruthy();

  await page.goto(`/admin/cases?requestId=${id}`);
  await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible({ timeout: 15_000 });

  // Outside the payment filter: the list no longer has it, the link still opens it.
  await page.getByTestId("case-payment-filter").selectOption("CONFIRMED");
  await expect(page.getByRole("button", { name: new RegExp(name) })).toHaveCount(0);
  await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("case-linked-note")).toBeVisible();

  // Date filter (server-side): nothing is created tomorrow.
  await page.getByTestId("case-payment-filter").selectOption("ALL");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByTestId("case-from-date").fill(tomorrow);
  await expect(page.getByText("لا توجد حالات في هذا القسم.")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("case-from-date").fill("");
  await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible({ timeout: 15_000 });

  // Phone width: the filters and the case fit without sideways scrolling.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/admin/cases?requestId=${id}`);
  await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible({ timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A link to a request that does not exist says so instead of a blank page.
  await page.goto(`/admin/cases?requestId=does-not-exist-${stamp}`);
  await expect(page.getByTestId("case-linked-error")).toBeVisible({ timeout: 15_000 });
});
