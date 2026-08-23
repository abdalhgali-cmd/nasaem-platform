import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAsSeededAdmin, readTrackingLoginCode } from "./helpers";

const BACKEND_URL = "http://localhost:5000";

// getPublicHomepage()/getPublicTheme()/getSiteAssetUrls() use Next's
// `next.revalidate: 60` fetch cache: a page already loaded in the browser
// never updates on its own (it was rendered server-side once, at the
// time of that request), and even a *fresh* navigation within the 60s
// window can still get served the stale cached version — Next's
// stale-while-revalidate semantics mean the first request after the
// window closes still returns the stale copy while triggering a
// background refresh, only the *next* request after that is guaranteed
// fresh. So proving "the change lands within the documented window"
// requires repeated real navigations, not watching one already-rendered
// page. Bounded to comfortably more than two 60s windows.
// Each `check()` call is itself given a short, bounded timeout and its
// errors are caught — a locator that doesn't match anything yet (e.g. the
// hero image hasn't rendered on this particular navigation) must not hang
// the whole poll; it just counts as "not ready", exactly like an
// unmatched value would, and the loop reloads and tries again.
async function pollByReloading<T>(page: Page, check: (timeoutMs: number) => Promise<T>, isDone: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 150_000;
  let last: T | undefined;
  do {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    try {
      last = await check(5_000);
      if (isDone(last)) return last;
    } catch {
      // Not ready on this navigation — fall through to retry.
    }
    await page.waitForTimeout(3_000);
  } while (Date.now() < deadline);
  throw new Error(`${label}: did not observe the expected value within the polling window. Last seen: ${JSON.stringify(last)}`);
}

// Platform 3.0 Phase 18 — the plan's own required E2E scenario list
// (Section 21): homepage, visa, airports, airlines, ferries, security
// approvals. Admin-side setup goes through the real API directly (already
// proven correct by 331 passing backend tests plus live Playwright
// verification of the actual admin UI in Phases 14-16 of this session) —
// what these tests add is genuine proof that the PUBLIC site (web/, this
// package) actually reflects those changes, which nothing else in this
// repo verifies.
//
// Two scenarios in the plan's list — "airline/logo → flight display
// resolves it" and "airport → search finds it" — have real, tested
// backend capability (flights.enrichment.js's attachAirlineLogos,
// airports.service.js's searchAirports) but the public flight-search UI
// (flight-search-client.tsx) never actually renders an airline logo or
// offers airport-search autocomplete; both origin/destination fields are
// plain free-text inputs. This is a genuine, disclosed gap found during
// this review, not something these tests paper over — see the two tests
// below that verify the backend contract directly and say so.
//
// Similarly, "admin adds requirement → application checklist changes" is
// verified against the real backend contract
// (GET /api/visa-types/:id/requirements/public) — the marketing site's
// intake wizard (service-intake-wizard.tsx) still uses a hardcoded
// VISA_DOCUMENTS_BY_CODE map for its document checklist and never fetches
// this endpoint, so a newly admin-added requirement does not yet change
// what a real customer sees there. Also a genuine, disclosed gap.

test.describe("Homepage — admin change reflects publicly", () => {
  test("changing the hero title updates the public homepage", async ({ page }) => {
    // pollByReloading's 150s budget (it needs to survive stale-while-
    // revalidate serving one more stale response after the 60s window
    // closes) needs headroom beyond the config's default 30s test timeout.
    test.setTimeout(180_000);
    await loginAsSeededAdmin(page);

    const beforeRes = await page.request.get(`${BACKEND_URL}/api/homepage/hero`);
    const before = (await beforeRes.json()).data;

    const newTitle = `E2E Hero Title ${Date.now()}`;
    const patchRes = await page.request.patch(`${BACKEND_URL}/api/homepage/hero`, { data: { title: newTitle } });
    expect(patchRes.ok()).toBeTruthy();

    try {
      await pollByReloading(
        page,
        (timeoutMs) => page.locator("h1").innerText({ timeout: timeoutMs }),
        (text) => text.includes(newTitle),
        "hero title"
      );
    } finally {
      await page.request.patch(`${BACKEND_URL}/api/homepage/hero`, { data: { title: before.title } });
    }
  });

  test("changing the theme's primary color updates the public site's CSS variable", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsSeededAdmin(page);

    const beforeRes = await page.request.get(`${BACKEND_URL}/api/theme`);
    const before = (await beforeRes.json()).data;

    const testColor = "#1a2b3c";
    const patchRes = await page.request.patch(`${BACKEND_URL}/api/theme`, { data: { primary: testColor } });
    expect(patchRes.ok()).toBeTruthy();

    try {
      await pollByReloading(
        page,
        () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()),
        (color: string) => color === testColor,
        "theme primary color"
      );
    } finally {
      await page.request.patch(`${BACKEND_URL}/api/theme`, { data: { primary: before.primary } });
    }
  });

  test("uploading a new hero image updates the public homepage's image", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsSeededAdmin(page);

    const beforeRes = await page.request.get(`${BACKEND_URL}/api/site-assets`);
    const beforeAsset = (await beforeRes.json()).data.find((a: { key: string }) => a.key === "hero-image");

    const uploadRes = await page.request.post(`${BACKEND_URL}/api/site-assets/hero-image`, {
      multipart: { image: { name: "hero.png", mimeType: "image/png", buffer: Buffer.from(HERO_TEST_PNG_BASE64, "base64") } },
    });
    expect(uploadRes.ok(), await uploadRes.text()).toBeTruthy();
    const uploaded = (await uploadRes.json()).data;
    const expectedVersion = `v=${new Date(uploaded.updatedAt).getTime()}`;

    await pollByReloading(
      page,
      (timeoutMs) => page.locator("img[alt='']").first().getAttribute("src", { timeout: timeoutMs }),
      (src) => !!src && src.includes(expectedVersion),
      "hero image src"
    );

    // No revert here on purpose: unlike hero text/theme (single-value
    // Settings rows, trivially reversible), a site asset upload replaces
    // the previous file on disk (see site-assets.service.js's
    // upsertSiteAsset — it unlinks the file it replaced) — there is
    // nothing to "revert" to. Leaving the test image in place is the same
    // posture as leaving a test-created row in the DB after other tests
    // in this suite; the fixture is small (a 1x1 PNG) and clearly
    // identifiable if a real admin ever needs to change it back.
    if (!beforeAsset) return; // nothing was there before — nothing more to note.
  });
});

test.describe("Visa — admin creates a visa type, it's reachable publicly by code", () => {
  test("a newly created visa type is resolved and shown by the public intake wizard", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    const code = `E2E-VISA-${Date.now()}`;

    const createRes = await admin.post(`${BACKEND_URL}/api/visa-types`, {
      data: { code, name: "تأشيرة اختبار E2E", country: "دولة اختبار", basePrice: 500, active: true },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();

    try {
      // The wizard resolves ANY valid visa type code passed via
      // ?visaType=, not just the marketing site's fixed 5 category cards
      // — this is the real, working mechanism by which a brand-new
      // admin-created visa type becomes reachable by a real customer
      // (e.g. a link shared by staff), even though /visas' own card grid
      // doesn't yet auto-list every admin-created visa type (a separate,
      // smaller disclosed gap: the grid is a fixed array in
      // app/visas/page.tsx, not fetched from the API).
      await page.goto(`/visas?visaType=${code}#book`);
      await expect(page.getByRole("button", { name: /تأشيرة اختبار E2E/ })).toBeVisible({ timeout: 15_000 });
    } finally {
      const listRes = await admin.get(`${BACKEND_URL}/api/visa-types?limit=100`);
      const created = (await listRes.json()).data.find((v: { code: string }) => v.code === code);
      if (created) await admin.delete(`${BACKEND_URL}/api/visa-types/${created.id}`);
    }
  });

  test("adding a requirement changes the public requirements-checklist API contract (backend only — see file header)", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    const code = `E2E-REQ-${Date.now()}`;

    const createRes = await admin.post(`${BACKEND_URL}/api/visa-types`, {
      data: { code, name: "تأشيرة متطلبات E2E", country: "دولة اختبار", basePrice: 100, active: true },
    });
    const visaType = (await createRes.json()).data;

    try {
      const beforeRes = await page.request.get(`${BACKEND_URL}/api/visa-types/${visaType.id}/requirements/public`);
      expect((await beforeRes.json()).data).toHaveLength(0);

      const reqRes = await admin.post(`${BACKEND_URL}/api/visa-types/${visaType.id}/requirements`, {
        data: { name: "مستند اختبار E2E", required: true },
      });
      expect(reqRes.ok(), await reqRes.text()).toBeTruthy();

      const afterRes = await page.request.get(`${BACKEND_URL}/api/visa-types/${visaType.id}/requirements/public`);
      const after = (await afterRes.json()).data;
      expect(after).toHaveLength(1);
      expect(after[0].name).toBe("مستند اختبار E2E");
    } finally {
      await admin.delete(`${BACKEND_URL}/api/visa-types/${visaType.id}`);
    }
  });

  test("enabling/disabling PASSPORT_OCR actually gates real MRZ extraction", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    const sample = path.join(__dirname, "fixtures", "passport-mrz-sample.png");

    const beforeFlagRes = await admin.get(`${BACKEND_URL}/api/feature-flags`);
    const wasEnabled = (await beforeFlagRes.json()).data.find((f: { key: string }) => f.key === "PASSPORT_OCR").enabled;

    try {
      await admin.patch(`${BACKEND_URL}/api/feature-flags/PASSPORT_OCR`, { data: { enabled: false } });
      const disabledScan = await admin.post(`${BACKEND_URL}/api/passport-ocr/scan`, {
        multipart: { image: { name: "p.png", mimeType: "image/png", buffer: require("node:fs").readFileSync(sample) } },
      });
      expect(disabledScan.status()).toBe(403);

      await admin.patch(`${BACKEND_URL}/api/feature-flags/PASSPORT_OCR`, { data: { enabled: true } });
      const enabledScan = await admin.post(`${BACKEND_URL}/api/passport-ocr/scan`, {
        multipart: { image: { name: "p.png", mimeType: "image/png", buffer: require("node:fs").readFileSync(sample) } },
      });
      expect(enabledScan.ok(), await enabledScan.text()).toBeTruthy();
      const data = (await enabledScan.json()).data;
      // Real MRZ text extraction from a real image — not mocked.
      expect(data.documentNumber).toBe("SD1234567");
      expect(data.surname).toBe("MOHAMED");
      expect(data.nationality).toBe("SDN");
    } finally {
      await admin.patch(`${BACKEND_URL}/api/feature-flags/PASSPORT_OCR`, { data: { enabled: wasEnabled } });
    }
  });
});

// Airport/airline codes must be letters-only (IATA: 3, ICAO: 3-4 depending
// on module — see each *.validators.js) — a numeric suffix isn't valid, so
// this derives a short, run-unique uppercase-letters-only suffix instead.
function letterSuffix(length: number): string {
  let n = Date.now();
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(65 + (n % 26));
    n = Math.floor(n / 26);
  }
  return out;
}

test.describe("Airports — backend search contract (see file header for the UI gap)", () => {
  test("a newly added airport is found by Arabic, English, IATA and ICAO search", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    const suffix = Date.now().toString().slice(-4);
    const createRes = await admin.post(`${BACKEND_URL}/api/airports`, {
      data: {
        nameAr: `مطار اختبار E2E ${suffix}`,
        nameEn: `E2E Test Airport ${suffix}`,
        cityAr: "مدينة الاختبار",
        cityEn: "Test City",
        countryAr: "دولة الاختبار",
        iataCode: letterSuffix(3),
        icaoCode: letterSuffix(4),
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const airport = (await createRes.json()).data;

    try {
      for (const q of ["اختبار E2E", "E2E Test", airport.iataCode, airport.icaoCode]) {
        const res = await page.request.get(`${BACKEND_URL}/api/airports/search?q=${encodeURIComponent(q)}`);
        const found = (await res.json()).data.some((a: { id: string }) => a.id === airport.id);
        expect(found, `search "${q}" should find the newly created airport`).toBeTruthy();
      }
    } finally {
      await admin.delete(`${BACKEND_URL}/api/airports/${airport.id}`);
    }
  });
});

test.describe("Airlines — backend logo-enrichment contract (see file header for the UI gap)", () => {
  test("a newly added airline with a logo is resolved onto a matching flight search result", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    // searchManualFlights() filters results to isSudaneseAirline() matches
    // (flights.service.js — a pre-existing, deliberately untouched
    // business rule from Phase 12, see this repo's own comments there) —
    // the airline name has to contain one of SUDANESE_AIRLINES' entries
    // (e.g. "BADR") to be included in search results at all, so the logo
    // match has something real to attach to.
    const airlineName = `BADR AIRLINES E2E TEST ${Date.now()}`;

    const createRes = await admin.post(`${BACKEND_URL}/api/airlines`, { data: { name: airlineName } });
    const airline = (await createRes.json()).data;

    const logoRes = await admin.post(`${BACKEND_URL}/api/airlines/${airline.id}/logo`, {
      multipart: { image: { name: "logo.png", mimeType: "image/png", buffer: Buffer.from(HERO_TEST_PNG_BASE64, "base64") } },
    });
    expect(logoRes.ok(), await logoRes.text()).toBeTruthy();
    // The create response's `airline.logoKey` is still null (logo didn't
    // exist yet) — the upload response has the real, current value.
    const airlineWithLogo = (await logoRes.json()).data;

    const flightRes = await admin.post(`${BACKEND_URL}/api/flights`, {
      data: {
        airline: airlineName,
        flightNumber: `E2${Date.now().toString().slice(-4)}`,
        originCode: "PZU",
        originName: "Port Sudan",
        destinationCode: "JED",
        destinationName: "Jeddah",
        departureAt: "2027-01-15T08:00:00+02:00",
        arrivalAt: "2027-01-15T11:00:00+02:00",
        stops: 0,
        cabin: "Economy",
        price: 100,
        currency: "USD",
        availableSeats: 5,
      },
    });
    const flight = (await flightRes.json()).data;

    try {
      const searchRes = await page.request.get(
        `${BACKEND_URL}/api/flights/search?legs=${encodeURIComponent(JSON.stringify([{ from: "PZU", to: "JED", departureDate: "2027-01-15" }]))}`
      );
      const body = await searchRes.json();
      const manualLegs = body?.legs?.[0]?.manual ?? [];
      const match = manualLegs.find((f: { id: string }) => f.id === flight.id);
      expect(match, "the created flight should appear in search results").toBeTruthy();
      expect(match.airlineLogoKey, "attachAirlineLogos should resolve the logo key by matching airline name").toBe(airlineWithLogo.logoKey);
      expect(match.airlineLogoKey).toBeTruthy();
    } finally {
      await admin.delete(`${BACKEND_URL}/api/flights/${flight.id}`);
      await admin.delete(`${BACKEND_URL}/api/airlines/${airline.id}`);
    }
  });
});

test.describe("Ferries — admin adds a schedule, it appears in the public form", () => {
  test("a new operator/schedule populate the ferries page's real dropdowns", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    const operatorName = `E2E Ferry Co ${Date.now()}`;

    const operatorRes = await admin.post(`${BACKEND_URL}/api/ferries/operators`, { data: { name: operatorName } });
    const operator = (await operatorRes.json()).data;

    const origin = `E2E Origin ${Date.now()}`;
    const destination = `E2E Destination`;
    const scheduleRes = await admin.post(`${BACKEND_URL}/api/ferries/operators/${operator.id}/schedules`, {
      data: { origin, destination, travelDate: "2027-02-01", basePrice: 50 },
    });
    const schedule = (await scheduleRes.json()).data;

    try {
      await page.goto("/ferries");
      await expect(page.getByLabel("الناقل المفضل")).toBeVisible();
      await expect(page.getByLabel("الناقل المفضل")).toContainText(operatorName, { timeout: 15_000 });
      await expect(page.getByLabel("المسار")).toContainText(`${origin} → ${destination}`, { timeout: 15_000 });
    } finally {
      await admin.delete(`${BACKEND_URL}/api/ferries/schedules/${schedule.id}`);
      await admin.delete(`${BACKEND_URL}/api/ferries/operators/${operator.id}`);
    }
  });
});

test.describe("Security approvals — full lifecycle through the real customer-facing UI", () => {
  test("request → documents → payment → processing → approval → delivery → completion", async ({ page }) => {
    const admin = await loginAsSeededAdmin(page).then(() => page.request);
    const suffix = Date.now().toString();
    const phone = `2499${suffix.slice(-8)}`;

    const servicesRes = await page.request.get(`${BACKEND_URL}/api/services/public`);
    const service = (await servicesRes.json()).data.services.find((s: { code: string }) => s.code === "SVC-EGYPT-CLEARANCE");
    expect(service, "SVC-EGYPT-CLEARANCE must be seeded (backend/prisma/seed.js)").toBeTruthy();

    // 1. Request — a real, unauthenticated public submission, exactly the
    // POST /api/contact-requests path web/'s /contact page's form uses.
    const createRes = await page.request.post(`${BACKEND_URL}/api/contact-requests`, {
      data: {
        name: "E2E Security Approval Customer",
        phone,
        service: "الموافقة الأمنية لمصر",
        serviceId: service.id,
        message: "طلب موافقة أمنية اختباري E2E",
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const contactRequest = (await createRes.json()).data;

    try {
      // Log into /track as this real customer (real browser, real OTP
      // read from the DB — see readTrackingLoginCode's doc comment).
      await page.goto("/track");
      await page.locator("#phone").fill(`+${phone}`);
      await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
      const code = readTrackingLoginCode(phone);
      await page.locator("#code").fill(code);
      await page.getByRole("button", { name: "تأكيد" }).click();

      await expect(page.getByText("تم استلام طلبك وهو قيد المراجعة")).toBeVisible({ timeout: 15_000 });

      // 2. Documents — the customer uploads a real file through the real
      // upload form.
      const docLabelInput = page.locator("input[placeholder='مثال: جواز السفر']");
      await docLabelInput.fill("جواز السفر");
      await page.setInputFiles("input[type='file']", path.join(__dirname, "fixtures", "sample-document.png"));
      await page.getByRole("button", { name: "رفع" }).click();
      await expect(page.getByText("قيد المراجعة").first()).toBeVisible({ timeout: 15_000 });

      // Staff reviews the document (admin API — the review UI itself was
      // already verified live in this session's Phase 14/15/16 work).
      const requestsRes = await admin.get(`${BACKEND_URL}/api/contact-requests?limit=200`);
      const staffView = (await requestsRes.json()).data.find((r: { id: string }) => r.id === contactRequest.id);
      const document = staffView.documents[0];
      await admin.patch(`${BACKEND_URL}/api/contact-requests/${contactRequest.id}/documents/${document.id}/status`, {
        data: { status: "ACCEPTED" },
      });

      // 3. Pricing/processing — staff sets the invoice.
      await admin.post(`${BACKEND_URL}/api/contact-requests/${contactRequest.id}/invoice`, {
        data: { amount: 250, currency: "SAR" },
      });

      // 4. Approval — the customer approves the price, through the real
      // approve button.
      await page.reload();
      await expect(page.getByRole("button", { name: "موافقة على السعر" })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "موافقة على السعر" }).click();
      await expect(page.getByRole("button", { name: "تم تحويل المبلغ" })).toBeVisible({ timeout: 15_000 });

      // Payment — the customer marks the transfer sent, through the real
      // button. paymentStatus moves from AWAITING_TRANSFER to
      // UNDER_REVIEW, so RequestTransferAction (which only renders while
      // AWAITING_TRANSFER) stops rendering the button — that's the real,
      // visible proof the transition happened.
      await page.getByRole("button", { name: "تم تحويل المبلغ" }).click();
      await expect(page.getByRole("button", { name: "تم تحويل المبلغ" })).not.toBeVisible({ timeout: 15_000 });

      // Staff confirms the payment (admin API).
      const confirmRes = await admin.post(`${BACKEND_URL}/api/contact-requests/${contactRequest.id}/confirm-payment`, { data: {} });
      expect(confirmRes.ok(), await confirmRes.text()).toBeTruthy();

      // 5. Delivery — staff uploads the finished clearance letter (admin API).
      const deliverableRes = await admin.post(`${BACKEND_URL}/api/contact-requests/${contactRequest.id}/deliverables`, {
        multipart: {
          label: "خطاب الموافقة الأمنية",
          file: { name: "clearance.png", mimeType: "image/png", buffer: Buffer.from(HERO_TEST_PNG_BASE64, "base64") },
        },
      });
      expect(deliverableRes.ok(), await deliverableRes.text()).toBeTruthy();

      // 6. Completion — staff closes the request as COMPLETED.
      const closeRes = await admin.patch(`${BACKEND_URL}/api/contact-requests/${contactRequest.id}/status`, {
        data: { status: "CLOSED", outcome: "COMPLETED" },
      });
      expect(closeRes.ok(), await closeRes.text()).toBeTruthy();

      // The real customer, in the real browser, sees the finished result:
      // completion status and a downloadable deliverable.
      await page.reload();
      await expect(page.getByText("تم إنجاز طلبك بنجاح")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: "خطاب الموافقة الأمنية" })).toBeVisible();
    } finally {
      await admin.delete(`${BACKEND_URL}/api/contact-requests/${contactRequest.id}`).catch(() => {});
    }
  });
});

// A minimal valid 1x1 red PNG, used everywhere an upload just needs to be
// a real, valid image file — the pixel content itself is never asserted on.
const HERO_TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
