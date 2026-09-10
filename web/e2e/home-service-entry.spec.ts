import { expect, test } from "@playwright/test";

test.describe("Homepage — primary service entry", () => {
  test("shows the core services and a direct tracking action", async ({ page }) => {
    await page.goto("/");

    const entry = page.locator("#start-request");
    await expect(entry).toBeVisible();

    for (const label of ["العمرة", "التأشيرات", "الطيران", "البواخر", "الفنادق"]) {
      await expect(entry.getByRole("tab", { name: label })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: "تتبع طلبك" }).first()).toHaveAttribute("href", "/track");
  });

  test("shows concise first-view trust signals without marketing claims", async ({ page }) => {
    await page.goto("/");

    const trustSignals = page.getByTestId("homepage-trust-signals");
    await expect(trustSignals).toBeVisible();
    await expect(trustSignals.getByText("اختيار الخدمة بوضوح")).toBeVisible();
    await expect(trustSignals.getByText("المستندات داخل مسار الطلب")).toBeVisible();
    await expect(trustSignals.getByText("تتبع حالة الطلب")).toBeVisible();
  });

  test("visa entry exposes the dedicated family-visit and Egypt flows", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator("#start-request");
    await entry.getByRole("tab", { name: "التأشيرات" }).click();

    await expect(entry.getByRole("link", { name: /زيارة عائلية للسعودية/ })).toHaveAttribute("href", "/visas/saudi-family-visit");
    await expect(entry.getByRole("link", { name: /الموافقة الأمنية لمصر/ })).toHaveAttribute("href", "/visas/egypt-security-approval");
    await expect(entry.getByRole("link", { name: /تأشيرات أخرى/ })).toHaveAttribute("href", "/visas");
  });

  test("ferry entry routes customers into the ferry booking page", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator("#start-request");
    await entry.getByRole("tab", { name: "البواخر" }).click();

    await expect(entry.getByRole("link", { name: /ابدأ حجز الباخرة/ })).toHaveAttribute("href", "/ferries");
  });
});
