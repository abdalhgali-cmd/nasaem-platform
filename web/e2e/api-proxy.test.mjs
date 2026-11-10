import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { apiProxyTarget } from "../src/lib/api-proxy.mjs";

test("existing direct API deployments do not enable a proxy", () => {
  assert.equal(apiProxyTarget({ NEXT_PUBLIC_API_URL: "https://qa.example/api" }), null);
});
test("same-origin API forwards to the exact configured backend", () => {
  assert.equal(apiProxyTarget({ NEXT_PUBLIC_API_URL: "/api", INTERNAL_API_URL: "https://qa.example/api/" }), "https://qa.example/api");
});
test("same-origin deployment refuses missing or unsafe targets", () => {
  for (const url of [undefined, "/api", "file:///api", "https://user:secret@qa.example/api", "https://qa.example/api?url=other", "https://qa.example/api#other", "https://qa.example/other"]) {
    assert.throws(() => apiProxyTarget({ NEXT_PUBLIC_API_URL: "/api", INTERNAL_API_URL: url }));
  }
});
test("a proxy cannot bypass the Preview production API guard", () => {
  assert.throws(() => apiProxyTarget({ NEXT_PUBLIC_API_URL: "/api", INTERNAL_API_URL: "https://nasaem-platform-production.up.railway.app/api", VERCEL_ENV: "preview" }), /production backend is forbidden/);
});

for (const browser of [false, true]) test(`API URL resolves for ${browser ? "browser cookies" : "server rendering"}`, () => {
  const moduleUrl = new URL("../src/lib/api-url.ts", import.meta.url).href;
  const script = `${browser ? 'globalThis.window = {location:{hostname:"qa.example",origin:"https://qa.example"}};' : ""} console.log((await import(${JSON.stringify(moduleUrl)})).API_URL);`;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    env: { ...process.env, NEXT_PUBLIC_API_URL: "/api", INTERNAL_API_URL: "https://qa.example/api", VERCEL_ENV: "" }, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), browser ? "/api" : "https://qa.example/api");
});
