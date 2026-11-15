// The deployed website in a real browser, read-only: the pages that need the
// API must actually show its data, and the browser must not block any request
// to the API (CORS). Exits 1 on failure.
import { chromium } from "playwright";

const SITE = process.env.SITE;
const API = process.env.API;
const failures = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar" })).newPage();
const corsErrors = [];
const failedApi = [];
page.on("console", (m) => { if (m.type() === "error" && /CORS|Access-Control-Allow-Origin/i.test(m.text())) corsErrors.push(m.text().slice(0, 200)); });
page.on("requestfailed", (r) => { if (r.url().startsWith(API)) failedApi.push(`${r.method()} ${r.url().slice(API.length)} ${r.failure()?.errorText || ""}`); });

async function step(name, run) {
  try { await run(); console.log(`ok   ${name}`); } catch (error) { failures.push(`${name}: ${String(error.message).split("\n")[0]}`); console.log(`FAIL ${name}: ${String(error.message).split("\n")[0]}`); }
}

await step("/umrah lists packages from the API", async () => {
  await page.goto(`${SITE}/umrah`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "اختر الباقة", exact: true }).waitFor({ timeout: 30_000 });
  const text = await page.locator("main").innerText();
  if (/تعذّر تحميل قائمة الخدمات/.test(text)) throw new Error("the page says the service list could not be loaded");
});

await step("the browser can read public API answers from the website", async () => {
  const result = await page.evaluate(async (api) => {
    const out = {};
    for (const path of ["/health", "/services/public/packages", "/services/public"]) {
      try { const r = await fetch(api + path, { credentials: "include" }); const body = await r.json(); out[path] = `${r.status} ${body?.success === true ? "success" : "no-success"}`; } catch (e) { out[path] = `BLOCKED ${e.message}`; }
    }
    // Staff session probe: without a session the readable answer is 401.
    try { const r = await fetch(api + "/auth/me", { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } }); out["/auth/me"] = String(r.status); } catch (e) { out["/auth/me"] = `BLOCKED ${e.message}`; }
    return out;
  }, API);
  console.log("     " + JSON.stringify(result));
  for (const [path, value] of Object.entries(result)) if (/BLOCKED/.test(value)) throw new Error(`${path} ${value}`);
  if (!/^200 success/.test(result["/services/public/packages"])) throw new Error(`packages: ${result["/services/public/packages"]}`);
  if (result["/auth/me"] !== "401") throw new Error(`/auth/me without a session: ${result["/auth/me"]}`);
});

await step("a service's requirements load in the browser", async () => {
  const result = await page.evaluate(async (api) => {
    const rows = (await (await fetch(api + "/services/public/packages")).json()).data || [];
    if (!rows.length) return "no published packages";
    const r = await fetch(`${api}/services/${rows[0].id}/requirements/public`);
    const body = await r.json();
    return `${r.status} ${Array.isArray(body?.data) ? "list" : "not-a-list"}`;
  }, API);
  console.log("     " + result);
  if (result !== "200 list") throw new Error(result);
});

await step("staff sign-in page reaches the API", async () => {
  await page.goto(`${SITE}/admin/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="password"]').first().waitFor({ timeout: 30_000 });
});

await step("no request to the API was blocked by the browser", async () => {
  if (corsErrors.length) throw new Error(`CORS console errors: ${corsErrors[0]}`);
  if (failedApi.length) throw new Error(`failed API requests: ${failedApi.slice(0, 3).join("; ")}`);
});

await browser.close();
if (failures.length) { console.log(`\n${failures.length} check(s) failed.`); process.exit(1); }
console.log("\nDeployed website reads the production API correctly.");
