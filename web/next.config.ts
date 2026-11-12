import type { NextConfig } from "next";
import { apiProxyTarget } from "./src/lib/api-proxy.mjs";

// On Railway the website is built per service and NEXT_PUBLIC_API_URL is baked
// in at build time. Without it the build would silently ship the local
// default (http://localhost:5000/api) and every form and the admin would fail
// in the browser, so a Railway build stops here instead.
if (process.env.RAILWAY_ENVIRONMENT_NAME && !String(process.env.NEXT_PUBLIC_API_URL || "").trim()) {
  throw new Error("NEXT_PUBLIC_API_URL is not set on this Railway service: set it to the API of the same environment (e.g. https://<api-service>.up.railway.app/api) and redeploy.");
}

const nextConfig: NextConfig = {
  // Opt-in proxy keeps the Google nonce and session cookies first-party.
  // The destination is fixed by server configuration, never a request input.
  async rewrites() {
    const target = apiProxyTarget(process.env);
    return target ? [{ source: "/api/:path*", destination: `${target}/:path*` }] : [];
  },
};

export default nextConfig;
