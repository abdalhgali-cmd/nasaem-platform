import { expect, test, type Page } from "@playwright/test";

// A field filled before React hydrates the form is reset by hydration and the
// search then runs with no date. Wait until React has attached its handlers.
async function openFlights(page: Page) {
  await page.goto("/flights");
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="زيادة البالغون"]');
    return Boolean(button) && Object.keys(button as object).some((key) => key.startsWith("__reactProps"));
  });
}

const flight = (id: string, from: string, to: string, departureAt: string, arrivalAt: string, price: number) => ({
  id,
  source: "MANUAL",
  airline: "TARCO",
  flightNumber: id,
  origin: { code: from, name: from },
  destination: { code: to, name: to },
  departureAt,
  arrivalAt,
  stops: 0,
  baggage: "30 KG",
  price,
  currency: "SDG",
  priceSdg: price,
  fxRateToSdg: 1,
});

test.describe("Issue #104 flight search", () => {
  test("separates round-trip results and sends passenger categories", async ({ page }) => {
    let searchUrl = "";
    await page.route("**/api/flights/search?**", async (route) => {
      searchUrl = route.request().url();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          tripConfigured: false,
          tripType: "ROUND_TRIP",
          legs: [
            { leg: 1, manual: [flight("3T101", "PZU", "JED", "2027-01-15T08:00:00Z", "2027-01-15T10:00:00Z", 250000)], trip: [] },
            { leg: 2, manual: [flight("3T102", "JED", "PZU", "2027-01-20T08:00:00Z", "2027-01-20T10:00:00Z", 275000)], trip: [] },
          ],
        }),
      });
    });

    await openFlights(page);
    await page.getByRole("button", { name: "ذهاب وعودة" }).click();
    await page.getByLabel("تاريخ السفر").fill("2027-01-15");
    await page.getByLabel("تاريخ العودة").fill("2027-01-20");
    await page.getByRole("button", { name: "زيادة الأطفال" }).click();
    await page.getByRole("button", { name: "بحث عن الرحلات" }).click();

    await expect(page.getByRole("heading", { name: "رحلة الذهاب" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "رحلة العودة" })).toBeVisible();
    await expect(page.getByText("250,000 SDG")).toBeVisible();
    await expect(page.getByText("275,000 SDG")).toBeVisible();
    expect(searchUrl).toContain("adults=1");
    expect(searchUrl).toContain("children=1");
    expect(searchUrl).toContain("infants=0");

    await page.getByRole("button", { name: "اختيار الرحلة" }).first().click();
    await page.getByRole("button", { name: "اختيار الرحلة" }).first().click();
    await page.getByRole("button", { name: "متابعة إلى بيانات المسافرين" }).click();
    await expect(page.getByRole("heading", { name: "بيانات الحجز" })).toBeVisible();
    await expect(page.locator("select")).toHaveCount(2);
    await expect(page.locator("select").nth(0)).toHaveValue("ADULT");
    await expect(page.locator("select").nth(1)).toHaveValue("CHILD");
  });

  test("provider results are reference-only and the total covers every passenger (AUDIT-00 G-01/G-02)", async ({ page }) => {
    await page.route("**/api/flights/search?**", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        tripConfigured: true,
        legs: [{ leg: 1, manual: [flight("3T201", "PZU", "JED", "2027-01-15T08:00:00Z", "2027-01-15T10:00:00Z", 250000)], trip: [{ ...flight("TRIP:x1", "PZU", "JED", "2027-01-15T12:00:00Z", "2027-01-15T14:00:00Z", 200000), source: "TRIP" }] }],
      }),
    }));
    await openFlights(page);
    await page.getByLabel("تاريخ السفر").fill("2027-01-15");
    await page.getByRole("button", { name: "زيادة البالغون" }).click();
    await page.getByRole("button", { name: "بحث عن الرحلات" }).click();

    await expect(page.getByText("للاطلاع فقط · غير قابلة للحجز المباشر")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "اختيار الرحلة" })).toHaveCount(1);
    await page.getByRole("button", { name: "اختيار الرحلة" }).click();
    await expect(page.getByTestId("flight-search-total")).toContainText("٥٠٠٬٠٠٠");
    await page.getByRole("button", { name: "متابعة إلى بيانات المسافرين" }).click();
    await expect(page.getByTestId("flight-booking-total")).toHaveText("500,000 ج.س");
  });

  test("a booking with an infant goes to the team instead of online booking", async ({ page }) => {
    await page.route("**/api/flights/search?**", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, tripConfigured: false, legs: [{ leg: 1, manual: [flight("3T301", "PZU", "JED", "2027-01-15T08:00:00Z", "2027-01-15T10:00:00Z", 250000)], trip: [] }] }),
    }));
    await openFlights(page);
    await page.getByLabel("تاريخ السفر").fill("2027-01-15");
    await page.getByRole("button", { name: "زيادة الرضع" }).click();
    await page.getByRole("button", { name: "بحث عن الرحلات" }).click();
    await page.getByRole("button", { name: "اختيار الرحلة" }).click();
    await expect(page.getByRole("link", { name: "تواصل مع فريق نسائم" })).toBeVisible();
    await expect(page.getByRole("button", { name: "متابعة إلى بيانات المسافرين" })).toHaveCount(0);
  });

  test("shows an explicit no-results state without invented fares", async ({ page }) => {
    await page.route("**/api/flights/search?**", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, tripConfigured: false, legs: [{ leg: 1, manual: [], trip: [] }] }),
    }));
    await openFlights(page);
    await page.getByLabel("تاريخ السفر").fill("2027-01-15");
    await page.getByRole("button", { name: "بحث عن الرحلات" }).click();
    await expect(page.getByRole("heading", { name: "لا توجد رحلات موثقة لهذه الرحلة حاليًا" })).toBeVisible();
    await expect(page.getByText("لن نعرض سعرًا أو توفرًا غير وارد من المصدر.")).toBeVisible();
  });
});
