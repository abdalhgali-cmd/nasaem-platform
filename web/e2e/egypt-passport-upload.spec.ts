import { expect, test } from "@playwright/test";
import path from "node:path";

const PAGE_URL = "http://localhost:3000/visas/egypt-security-approval";
const PASSPORT_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");

test.describe("Egypt Security Approval passport upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
  });

  test("shows the passport control before a server draft exists", async ({ page }) => {
    await expect(page.getByText(/^ارفع صورة جواز السفر/)).toBeVisible();
    await expect(page.getByText("اختر صورة الجواز", { exact: true })).toBeVisible();
  });

  test("creates the draft on demand and uploads a passport", async ({ page }) => {
    test.setTimeout(90_000);
    const draftRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/api\/intake-drafts(?:\?|$)/.test(request.url())) {
        draftRequests.push(request.url());
      }
    });

    await page.locator('input[type="file"]').setInputFiles(PASSPORT_FIXTURE);

    await expect(page.getByText("تم رفع الجواز بنجاح", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "استبدال" })).toBeVisible();
    expect(draftRequests).toHaveLength(1);
  });

  test("reports a disallowed file before attempting an upload", async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles({
      name: "passport.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a passport image"),
    });

    await expect(page.getByText("نوع الملف غير مدعوم. ارفع صورة JPG/PNG أو ملف PDF.")).toBeVisible();
  });
});
