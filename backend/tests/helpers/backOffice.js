import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

export function publicFile(relativePath) {
  return fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf8");
}

export function listPublicFiles(extension) {
  const results = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith(extension)) results.push(path.relative(PUBLIC_DIR, full));
    }
  };
  walk(PUBLIC_DIR);
  return results.sort();
}

// Loads a back-office page into jsdom with its own scripts (in page order)
// and a fake fetch. `routes` maps "METHOD /api/path" (query string ignored
// unless the key contains "?") to a JSON body or a function returning
// { status, body }. Every request is recorded in `calls`.
export function loadBackOffice(page, { routes = {}, url } = {}) {
  const html = publicFile(page);
  const scriptSrcs = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), {
    url: url || `http://backoffice.test/${page}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const calls = [];

  window.fetch = async (input, init = {}) => {
    const target = new URL(String(input), window.location.href);
    const method = (init.method || "GET").toUpperCase();
    const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, path: target.pathname, search: target.search, body, headers: init.headers || {} });
    const handler = routes[`${method} ${target.pathname}${target.search}`] ?? routes[`${method} ${target.pathname}`];
    let status = 200;
    let payload = { success: false, message: "not mocked" };
    if (handler === undefined) status = 404;
    else if (typeof handler === "function") ({ status = 200, body: payload } = await handler({ method, path: target.pathname, search: target.search, body }));
    else payload = handler;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    };
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};

  // Browsers share one global lexical scope across classic <script> tags
  // (a `const api` in api.js is visible to later scripts); jsdom's eval
  // does not, so the page's scripts run as one program, in page order.
  window.eval(scriptSrcs.map((src) => `${publicFile(src)}\n;`).join("\n"));

  return { window, document: window.document, calls };
}

export function settle(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
