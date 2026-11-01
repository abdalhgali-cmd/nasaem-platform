import { expect, test } from "@playwright/test";

test.describe("Site header — service start CTA", () => {
  test("navigation exposes only Umrah and Egypt approval as customer services", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "العمرة", exact: true })).toHaveAttribute("href", "/umrah");
    await expect(header.getByRole("link", { name: "الموافقة الأمنية لمصر", exact: true })).toHaveAttribute("href", "/visas/egypt-security-approval");
    await expect(header.getByRole("link", { name: "التأشيرات", exact: true })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "تتبع الطلب", exact: true })).toHaveAttribute("href", "/track");

    const footerServices = page.getByRole("navigation", { name: "خدماتنا" });
    await expect(footerServices.getByRole("link", { name: "باقات العمرة" })).toHaveAttribute("href", "/umrah");
    await expect(footerServices.getByRole("link", { name: "الموافقة الأمنية لمصر" })).toHaveAttribute("href", "/visas/egypt-security-approval");
    for (const label of ["تأشيرات الزيارة والعمل", "حجز تذاكر الطيران", "حجز الفنادق", "باقات السفر الشاملة"]) {
      await expect(footerServices.getByRole("link", { name: label })).toHaveCount(0);
    }
  });

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
