import { expect, test } from "@playwright/test";

test.describe("Homepage — primary service entry", () => {
  test("shows the core services and a direct tracking action", async ({ page }) => {
    await page.goto("/");

    for (const label of ["العمرة", "التأشيرات", "الطيران", "البواخر", "الفنادق"]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: "تتبع طلبك" }).first()).toHaveAttribute("href", "/track");
    await expect(page.locator("#start-request")).toBeVisible();
  });

  test("visa entry exposes the dedicated family-visit and Egypt flows", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "التأشيرات" }).click();

    await expect(page.getByRole("link", { name: /زيارة عائلية للسعودية/ })).toHaveAttribute("href", "/visas/saudi-family-visit");
    await expect(page.getByRole("link", { name: /الموافقة الأمنية لمصر/ })).toHaveAttribute("href", "/visas/egypt-security-approval");
    await expect(page.getByRole("link", { name: /تأشيرات أخرى/ })).toHaveAttribute("href", "/visas");
  });

  test("ferry entry routes customers into the ferry booking page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "البواخر" }).click();

    await expect(page.getByRole("link", { name: /ابدأ حجز الباخرة/ })).toHaveAttribute("href", "/ferries");
  });
});
