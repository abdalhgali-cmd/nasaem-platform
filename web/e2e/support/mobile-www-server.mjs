// Serves the Android app's web bundle (mobile/www) for the browser E2E suite,
// pointing it at the local backend instead of the staging URL baked into
// config.js. Nothing here ships: the APK is built from mobile/www as-is.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../mobile/www");
const apiBase = process.env.MOBILE_API_BASE || "http://localhost:5000/api";
const port = Number(process.env.MOBILE_WWW_PORT || 8081);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/js/config.js") {
      res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" });
      res.end(`export const CONFIG = { apiBaseUrl: ${JSON.stringify(apiBase)}, environment: "e2e", appVersion: "e2e", supportPhone: "" };`);
      return;
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`mobile www on http://localhost:${port}`));
