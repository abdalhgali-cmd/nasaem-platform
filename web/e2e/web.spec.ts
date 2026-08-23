import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, loginAsSeededAdmin } from "./helpers";

test.describe("Operations Center — mobile viewport", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSeededAdmin(page);
  });

  test("renders without horizontal overflow and the core controls are usable", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "networkidle" });

    // If the login/session cookie didn't actually apply to this page, the
    // fetch in operations-center.tsx 401s and shows this banner instead of
    // real data — everything below it would otherwise still look "correct"
    // (an error state and an empty result list render near-identically),
    // so this is what actually proves the mobile session is authenticated.
    await expect(page.getByText("تعذر تحميل مركز العمليات")).not.toBeVisible();

    // The table itself may need to scroll (it's wrapped in overflow-x-auto
    // in operations-center.tsx) — that's fine. The page body must not.
    const bodyOverflow = await assertNoHorizontalOverflow(page);
    expect(bodyOverflow, "page body should not force horizontal scroll on a mobile viewport").toBeLessThanOrEqual(1);

    const search = page.locator('input[placeholder*="بحث"]');
    await expect(search).toBeVisible();
    const searchBox = await search.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(searchBox!.width).toBeGreaterThan(0);
    expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);

    // All three filter <select>s (status, service, employee) must actually
    // be reachable/tappable at this width, not clipped off-screen.
    const selects = page.locator("select");
    await expect(selects).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = await selects.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(28); // usable tap target
    }

    // The refresh button in the header is a primary action — must meet a
    // reasonable minimum touch-target size on a real phone.
    const refreshButton = page.getByRole("button", { name: /تحديث/ });
    await expect(refreshButton).toBeVisible();
    const refreshBox = await refreshButton.boundingBox();
    expect(refreshBox!.height).toBeGreaterThanOrEqual(32);

    // Create a real order via the (now-authenticated) session and prove
    // the search box actually finds and then filters it out — not just
    // that an empty-state message can render.
    const customerRes = await page.request.post("http://localhost:5000/api/customers", {
      data: { fullName: `Mobile E2E Customer ${Date.now()}`, passportNo: `MOBE2E${Date.now()}`, nationality: "Test" },
    });
    const customer = (await customerRes.json()).data;
    const servicesRes = await page.request.get("http://localhost:5000/api/services?limit=1");
    const service = (await servicesRes.json()).data[0];
    const orderRes = await page.request.post("http://localhost:5000/api/orders", {
      data: { customerId: customer.id, items: [{ serviceId: service.id, quantity: 1, unitPrice: 10 }] },
    });
    const order = (await orderRes.json()).data;

    await page.getByRole("button", { name: /تحديث/ }).click();
    await page.waitForTimeout(500);
    await search.fill(order.orderNumber);
    await expect(page.getByText(order.orderNumber)).toBeVisible();

    await search.fill("no-such-order-xyz-123");
    await expect(page.getByText("لا توجد طلبات مطابقة للبحث أو الفلتر.")).toBeVisible();
    await search.fill("");
  });
});

test.describe("Payment Review — mobile viewport", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSeededAdmin(page);
  });

  test("renders without horizontal overflow and action buttons are tappable", async ({ page }) => {
    await page.goto("/admin/payment-review", { waitUntil: "networkidle" });

    const overflow = await assertNoHorizontalOverflow(page);
    expect(overflow, "page body should not force horizontal scroll on a mobile viewport").toBeLessThanOrEqual(1);

    const heading = page.getByRole("heading", { name: "مراجعة الدفعات" });
    await expect(heading).toBeVisible();

    // Either the empty state or at least one pending item must render
    // legibly (not overlapping/clipped) — whichever the current DB has.
    const emptyState = page.getByText("لا توجد دفعات بانتظار المراجعة.");
    const confirmButtons = page.getByRole("button", { name: /تأكيد الدفع/ });
    await expect(emptyState.or(confirmButtons.first())).toBeVisible();

    const count = await confirmButtons.count();
    for (let i = 0; i < count; i++) {
      const box = await confirmButtons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(32);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  });
});
