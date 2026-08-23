import path from "node:path";
import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

// frontend/request.html is the staff intake page — creating an order and
// uploading the customer's documents (passport/photo/etc.) from a phone in
// the field is exactly the mobile use case this covers, and it's the
// primary "Documents" surface (Order.documents), distinct from the
// ContactRequest document review flow already covered elsewhere.
test.describe("Staff intake (request.html) — mobile viewport", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSeededAdmin(page);
  });

  test("service selection and the customer form render without horizontal overflow", async ({ page }) => {
    await page.goto("/request.html", { waitUntil: "networkidle" });

    const overflow = await assertNoHorizontalOverflow(page);
    expect(overflow, "page body should not force horizontal scroll on a mobile viewport").toBeLessThanOrEqual(1);

    const flightCard = page.locator('.service-card[data-key="flight"]');
    await expect(flightCard).toBeVisible();
    const cardBox = await flightCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.height).toBeGreaterThanOrEqual(32);
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);

    await flightCard.click();
    await expect(page.locator("#customer-section")).toBeVisible();

    const overflowAfterSelect = await assertNoHorizontalOverflow(page);
    expect(overflowAfterSelect).toBeLessThanOrEqual(1);
  });

  test("creates an order and uploads a document end-to-end at mobile width", async ({ page }) => {
    await page.goto("/request.html", { waitUntil: "networkidle" });

    await page.locator('.service-card[data-key="flight"]').click();

    const suffix = Date.now().toString(36);
    await page.fill("#c-fullName", `E2E Mobile Test ${suffix}`);
    await page.fill("#c-passportNo", `E2EMOBILE${suffix}`);
    await page.fill("#c-nationality", "Test");
    await page.fill("#o-unitPrice", "150");

    const submitButton = page.locator("#submit-request-btn");
    await expect(submitButton).toBeVisible();
    const submitBox = await submitButton.boundingBox();
    // primary CTA must be a reasonable tap target on mobile
    expect(submitBox!.height).toBeGreaterThanOrEqual(32);

    await submitButton.click();
    await expect(page.locator("#success-section")).toBeVisible({ timeout: 10_000 });

    const overflowAfterSubmit = await assertNoHorizontalOverflow(page);
    expect(overflowAfterSubmit).toBeLessThanOrEqual(1);

    // Upload a real document — the doc-type select and file input must
    // both be usable at this width, and the upload must actually succeed.
    await page.selectOption("#doc-type", "PASSPORT");
    await page.setInputFiles("#doc-file", path.join(__dirname, "fixtures", "sample-document.png"));
    await page.click("#upload-doc-btn");

    await expect(page.locator("#uploaded-list")).toContainText("PASSPORT", { timeout: 10_000 });

    const finalOverflow = await assertNoHorizontalOverflow(page);
    expect(finalOverflow).toBeLessThanOrEqual(1);
  });
});
