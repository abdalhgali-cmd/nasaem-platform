import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Dedicated ports keep an older local preview from testing stale code or DBs.
process.env.E2E_BACKEND_URL = "http://localhost:5006";
export default defineConfig({ ...base,
  projects: [{ name: "platform3", testMatch: /umrah-payment-journey\.spec\.ts/,
    use: { baseURL: "http://localhost:3006" } }],
  webServer: [
    { command: "npx next dev --webpack", cwd: __dirname,
      env: { PORT: "3006", NEXT_PUBLIC_API_URL: "http://localhost:5006/api" },
      url: "http://localhost:3006/track", reuseExistingServer: process.env.E2E_REUSE_SERVER === "1", timeout: 120000 },
    { command: "npm start", cwd: "../backend", env: { PORT: "5006" },
      url: "http://localhost:5006/api/health", reuseExistingServer: process.env.E2E_REUSE_SERVER === "1", timeout: 120000 },
  ],
});
