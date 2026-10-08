import { expect, test } from "@playwright/test";

test.describe("Site header — service start CTA", () => {
  test("desktop header routes customers to the homepage service entry", async ({ page }) => {
    await page.goto("/visas");

    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "ابدأ طلبك" })).toHaveAttribute("href", "/#start-request");
  });

  test("mobile menu exposes the same service-start CTA", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/visas");

    await page.getByRole("button", { name: "فتح القائمة" }).click();
    await expect(page.getByRole("link", { name: "ابدأ طلبك" })).toHaveAttribute("href", "/#start-request");
  });
});
