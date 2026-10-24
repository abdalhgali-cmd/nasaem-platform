import { expect, test, type Page } from "@playwright/test";

import { loginAsSeededAdmin } from "./helpers";

// Track A3 (AUDIT-00 G-06): the website hotel and ferry forms collect what
// each booking needs per traveler, so the request can become ready.
// Real backend, synthetic data only.
const BACKEND_URL = "http://localhost:5000";
const phone = () => `0912${String(Date.now()).slice(-6)}`;

// A field filled before React hydrates the form is reset by hydration.
async function openForm(page: Page, path: string, submitLabel: string) {
  await page.goto(path);
  const submit = page.getByRole("button", { name: submitLabel });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await page.waitForFunction((label) => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
    return Boolean(button) && Object.keys(button as object).some((key) => key.startsWith("__reactProps"));
  }, submitLabel);
}

async function staffRequest(page: Page, id: string) {
  await loginAsSeededAdmin(page);
  const res = await page.request.get(`${BACKEND_URL}/api/contact-requests/${id}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).data;
}

test.describe("hotel and ferry requests collect each traveler's data (AUDIT-00 G-06)", () => {
  test("hotel: one lead-guest name per room, no passport; stored as the request's travelers", async ({ page }) => {
    await openForm(page, "/hotels", "إرسال طلب الفندق");
    await page.getByLabel("عدد الغرف").fill("2");
    await page.getByLabel("عدد النزلاء").fill("3");
    await page.getByLabel("تاريخ الدخول").fill("2027-04-01");
    await page.getByLabel("تاريخ الخروج").fill("2027-04-05");
    await page.getByLabel("الاسم الكامل").fill("عميل تجريبي");
    await page.getByLabel("رقم الهاتف / واتساب").fill(phone());
    await expect(page.getByTestId("hotel-lead-guests").getByRole("textbox")).toHaveCount(2);
    await expect(page.getByTestId("hotel-lead-guests")).not.toContainText("رقم الجواز:");

    await page.getByLabel("اسم الضيف الرئيسي للغرفة 1").fill("ضيف أول");
    await page.getByRole("button", { name: "إرسال طلب الفندق" }).click();
    await expect(page.getByText("اكتب اسم الضيف الرئيسي لكل غرفة.")).toBeVisible();

    await page.getByLabel("اسم الضيف الرئيسي للغرفة 2").fill("ضيف ثانٍ");
    await page.getByRole("button", { name: "إرسال طلب الفندق" }).click();
    await expect(page.getByText(/رقم الطلب:/)).toBeVisible({ timeout: 15_000 });
    const id = (await page.getByText(/رقم الطلب:/).textContent())!.split("رقم الطلب:")[1].trim();

    const request = await staffRequest(page, id);
    expect(request.travelerCount).toBe(2);
    expect(request.travelers.map((t: { fullName: string }) => t.fullName).sort()).toEqual(["ضيف أول", "ضيف ثانٍ"].sort());
    expect(request.intakeData).toMatchObject({ guests: 3, rooms: 2, leadGuestPerRoom: true });
    expect(Array.isArray(request.progress.completionBlockers)).toBe(true);
    expect(request.progress.completionBlockers.map((r: { code: string }) => r.code)).not.toContain("TRAVELERS_MISSING");
  });

  test("ferry: name, nationality and passport per passenger (birth date optional)", async ({ page }) => {
    await openForm(page, "/ferries", "إرسال طلب حجز العبارة");
    await page.getByLabel("الاسم الكامل").first().fill("عميل تجريبي");
    await page.getByLabel("رقم الهاتف / واتساب").fill(phone());
    await page.getByLabel("تاريخ السفر").fill("2027-05-01");
    await page.getByLabel("عدد المسافرين").fill("2");
    await expect(page.getByTestId("ferry-passengers").getByText(/الراكب \d/)).toHaveCount(2);

    for (const n of [1, 2]) {
      await page.getByLabel(`اسم الراكب ${n}`).fill(`راكب ${n}`);
      await page.getByLabel(`جنسية الراكب ${n}`).fill("سوداني");
    }
    await page.getByLabel("رقم جواز الراكب 1").fill("SYN1000001");
    await page.getByRole("button", { name: "إرسال طلب حجز العبارة" }).click();
    await expect(page.getByText("أكمل اسم كل راكب وجنسيته ورقم جوازه كما في جواز السفر.")).toBeVisible();

    await page.getByLabel("رقم جواز الراكب 2").fill("SYN1000002");
    // Lowering then raising the count keeps what was typed.
    await page.getByLabel("عدد المسافرين").fill("1");
    await page.getByLabel("اسم الراكب 1").fill("راكب 1");
    await page.getByLabel("عدد المسافرين").fill("2");
    await expect(page.getByLabel("رقم جواز الراكب 2")).toHaveValue("SYN1000002");
    await page.getByRole("button", { name: "إرسال طلب حجز العبارة" }).click();
    await expect(page.getByText(/رقم الطلب:/)).toBeVisible({ timeout: 15_000 });
    const id = (await page.getByText(/رقم الطلب:/).textContent())!.split("رقم الطلب:")[1].trim();

    const request = await staffRequest(page, id);
    expect(request.travelerCount).toBe(2);
    expect(request.travelers.map((t: { passportNo: string }) => t.passportNo).sort()).toEqual(["SYN1000001", "SYN1000002"]);
    expect(request.travelers.every((t: { nationality: string }) => t.nationality === "سوداني")).toBe(true);
    expect(Array.isArray(request.progress.completionBlockers)).toBe(true);
    expect(request.progress.completionBlockers.map((r: { code: string }) => r.code)).not.toContain("TRAVELERS_MISSING");
  });
});
