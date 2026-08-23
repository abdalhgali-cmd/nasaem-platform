import { defineConfig, devices } from "@playwright/test";

// Mobile-viewport regression coverage for the staff-facing surfaces most
// likely to be used from a phone in the field: the Operations Center and
// Payment Review pages (web/, Next.js) and the customer-facing document
// upload flow (frontend/request.html, served by the Express backend).
//
// Requires a migrated + seeded database (see backend/README.md's Testing
// section) reachable at the DATABASE_URL the backend picks up, and
// SEED_ADMIN_PASSWORD set to the password that account was seeded with —
// same prerequisites as `npm test` in backend/, just pointed at a
// non-disposable dev-style database since these tests read real UI state
// rather than hitting the API directly. Not wired into CI yet (CI only
// runs the backend test suite — see .github/workflows/ci.yml); run
// `npm run test:e2e` locally after `npm run dev` prerequisites are met.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // These specs share one real dev database rather than an isolated
  // fixture per test — serialize workers so two specs can't race each
  // other's writes (and to avoid this sandboxed environment's resource
  // contention when launching multiple Chromium instances at once).
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
    // Matches this environment's pre-installed Chromium regardless of
    // which @playwright/test version resolves — see AGENTS.md/session notes
    // on PLAYWRIGHT_BROWSERS_PATH.
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
      // Required to launch Chromium as root (this environment's containers
      // commonly run as root); harmless in a real, isolated CI/dev sandbox.
      args: process.env.PLAYWRIGHT_NO_SANDBOX === "0" ? [] : ["--no-sandbox"],
    },
  },
  projects: [
    {
      name: "mobile-web",
      testMatch: /web\.spec\.ts/,
      use: { ...devices["Pixel 5"], baseURL: "http://localhost:3000" },
    },
    {
      // Platform 3.0 Phase 18's required E2E scenarios (admin change on
      // one surface → public site reflects it) — desktop viewport, since
      // these aren't mobile-regression tests like the others in this
      // file, they're data-flow tests. baseURL is the public site;
      // backend/admin calls go through page.request with an absolute
      // localhost:5000 URL, same pattern as web.spec.ts already uses.
      name: "platform3",
      testMatch: /platform3\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000" },
    },
    {
      name: "mobile-frontend",
      testMatch: /frontend\.spec\.ts/,
      // Deliberately not devices["iPhone 12"]/any Apple preset — those
      // default to WebKit, which isn't installed in this environment (only
      // Chromium is, see AGENTS.md/session notes), and would silently try
      // to launch it as "chromium" via launchOptions.executablePath above,
      // failing at browser-launch time with no useful error. Same physical
      // viewport (390x844 CSS px, matching a real iPhone 12) via Chromium's
      // own mobile emulation instead.
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        baseURL: "http://localhost:5000",
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: __dirname,
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run start",
      cwd: "../backend",
      url: "http://localhost:5000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
