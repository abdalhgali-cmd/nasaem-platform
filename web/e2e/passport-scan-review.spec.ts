import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsSeededAdmin } from "./helpers";

// Issue #103: the website traveler form reads a passport photo through the
// real backend OCR, fills every MRZ field, and cannot continue until the
// customer confirms the data. Blurry photos fall back to manual entry, the
// same passport twice in one request blocks, and short validity only warns.

const BACKEND = "http://localhost:5000";
const CLEAR = path.join(__dirname, "fixtures", "passport-mrz-sample.png");
const BLURRY = path.join(__dirname, "..", "..", "backend", "tests", "fixtures", "passport-mrz-blurry.png");

function isoMonthsFromNow(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

test("passport scan fills the traveler, needs review, and flags duplicates and short validity", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = await loginAsSeededAdmin(page).then(() => page.request);
  const stamp = `${Date.now()}`.slice(-8);
  const code = `E2E-MRZ-${stamp}`;
  const phone = `2499${stamp}`;

  const flags = (await (await admin.get(`${BACKEND}/api/feature-flags`)).json()).data as Array<{ key: string; enabled: boolean }>;
  const ocrWasEnabled = flags.find((f) => f.key === "PASSPORT_OCR")?.enabled ?? false;
  expect((await admin.patch(`${BACKEND}/api/feature-flags/PASSPORT_OCR`, { data: { enabled: true } })).ok()).toBeTruthy();

  const visa = await admin.post(`${BACKEND}/api/visa-types`, {
    data: { code, name: `تأشيرة اختبار الجواز ${stamp}`, country: "اختبار", category: "INTERNATIONAL", basePrice: 0, currency: "SAR", active: true },
  });
  expect(visa.ok(), await visa.text()).toBeTruthy();
  const visaId = (await visa.json()).data.id as string;
  const requirement = await admin.post(`${BACKEND}/api/visa-types/${visaId}/requirements`, {
    data: { name: "صورة الجواز", required: false, type: "DOCUMENT", scope: "TRAVELER", ocrEnabled: true },
  });
  expect(requirement.ok(), await requirement.text()).toBeTruthy();

  try {
    await page.goto(`/visas?visaType=${code}&visaCategory=INTERNATIONAL#book`);
    await page.getByRole("button", { name: "التالي" }).click();
    await page.getByPlaceholder("اسمك الكامل").fill(`عميل الجواز ${stamp}`);
    await page.getByPlaceholder("+249 9XX XXX XXX").fill(`+${phone}`);
    await page.getByRole("button", { name: "التالي" }).click();

    const next = page.getByRole("button", { name: "التالي" });
    await page.locator('input[type="number"]').fill("2");

    // A clear photo fills every MRZ field — and the step waits for review.
    await page.getByTestId("passport-scan-0").locator('input[type="file"]').setInputFiles(CLEAR);
    await expect(page.getByPlaceholder("اسم المسافر 1")).toHaveValue("AHMED MOHAMED", { timeout: 60_000 });
    await expect(page.getByPlaceholder("رقم الجواز (اختياري)").first()).toHaveValue("SD1234567");
    await expect(page.getByTestId("traveler-birth-date-0")).toHaveValue("1990-05-15");
    await expect(page.getByTestId("traveler-gender-0")).toHaveValue("MALE");
    await expect(page.getByTestId("traveler-passport-expiry-0")).toHaveValue("2030-01-01");
    await expect(next).toBeDisabled();
    const confirm = page.getByTestId("passport-review-confirm-0");
    await confirm.check();
    await expect(next).toBeEnabled();
    await confirm.uncheck();
    await expect(next).toBeDisabled();
    await confirm.check();
    await expect(next).toBeEnabled();

    // A blurry photo is never guessed at: the customer types the data.
    await page.getByTestId("passport-scan-1").locator('input[type="file"]').setInputFiles(BLURRY);
    await expect(page.getByText("تعذّرت قراءة بيانات الجواز تلقائيًا. يمكنك إدخالها يدويًا.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByPlaceholder("اسم المسافر 2")).toHaveValue("");
    await expect(page.getByTestId("passport-review-confirm-1")).toHaveCount(0);

    // The same passport twice in one request blocks the step.
    await page.getByPlaceholder("اسم المسافر 2").fill("SARA MOHAMED");
    await page.getByPlaceholder("رقم الجواز (اختياري)").nth(1).fill("sd 1234567");
    await expect(page.getByTestId("passport-duplicate-1")).toBeVisible();
    await expect(next).toBeDisabled();
    await page.getByPlaceholder("رقم الجواز (اختياري)").nth(1).fill("SD7654321");
    await expect(page.getByTestId("passport-duplicate-1")).toHaveCount(0);

    // Short validity warns but does not block.
    await page.getByTestId("traveler-passport-expiry-1").fill(isoMonthsFromNow(2));
    await expect(page.getByTestId("passport-validity-warning-1")).toBeVisible();
    await expect(page.getByTestId("passport-validity-warning-0")).toHaveCount(0);
    await expect(next).toBeEnabled();
    await next.click();

    // The scanned photo is already this traveler's passport document.
    await expect(page.getByText("passport-mrz-sample.png")).toBeVisible({ timeout: 15_000 });
    await next.click();
    await page.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(page.getByText("تم استلام طلبك")).toBeVisible({ timeout: 15_000 });

    const list = await admin.get(`${BACKEND}/api/contact-requests?limit=20&search=${phone}`);
    const summary = ((await list.json()).data as Array<{ id: string; phone: string }>).find((r) => r.phone.endsWith(phone));
    expect(summary, "the request was created").toBeTruthy();
    const detail = (await (await admin.get(`${BACKEND}/api/contact-requests/${summary!.id}`)).json()).data;
    const first = detail.travelers.find((t: { passportNo: string }) => t.passportNo === "SD1234567");
    expect(first.fullName).toBe("AHMED MOHAMED");
    expect(first.gender).toBe("MALE");
    expect(String(first.birthDate).slice(0, 10)).toBe("1990-05-15");
    expect(detail.intakeData.travelers[0]).toMatchObject({ passportExpiry: "2030-01-01", ocrConfirmed: true });
    const passports = (detail.documents as Array<{ travelerId: string | null; ocrResult: { documentNumber?: string } | null }>).filter(
      (d) => d.travelerId === first.id
    );
    expect(passports).toHaveLength(1);
    expect(passports[0].ocrResult?.documentNumber).toBe("SD1234567");
  } finally {
    await admin.patch(`${BACKEND}/api/visa-types/${visaId}`, { data: { active: false } });
    await admin.patch(`${BACKEND}/api/feature-flags/PASSPORT_OCR`, { data: { enabled: ocrWasEnabled } });
  }
});
