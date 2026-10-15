import fs from "fs";

// Reads the mounted routers and reports, per "METHOD /api/path", how the
// route is guarded: the staff roles requireRole allows (sorted), or one of
// STAFF_ANY (requireAuth, no role list), CUSTOMER (customer bearer token),
// TRACKING (phone + OTP session), PUBLIC (none of the above).
// Router-level middleware (router.use) applies only to routes declared
// after it, exactly as Express runs it.
export async function routeGuards() {
  const routesDir = new URL("../../src/routes/", import.meta.url);
  const index = fs.readFileSync(new URL("index.js", routesDir), "utf8");
  const imports = Object.fromEntries([...index.matchAll(/import (\w+) from "(\.\.\/modules\/[^"]+)"/g)].map((m) => [m[1], m[2]]));
  const mounts = [...index.matchAll(/router\.use\("([^"]+)", (\w+)\)/g)].map((m) => ({ prefix: m[1], file: imports[m[2]] }));
  const out = {};
  for (const { prefix, file } of mounts) {
    const router = (await import(new URL(file, routesDir))).default;
    const routerLevel = [];
    for (const layer of router.stack) {
      if (!layer.route) {
        routerLevel.push(layer.handle);
        continue;
      }
      const handlers = [...routerLevel, ...layer.route.stack.map((l) => l.handle)];
      const roleGuards = handlers.map((h) => h?.allowedRoles).filter(Boolean);
      const names = new Set(handlers.map((h) => h?.name));
      let guard;
      if (roleGuards.length) guard = [...roleGuards[roleGuards.length - 1]].sort();
      else if (names.has("requireAuth")) guard = "STAFF_ANY";
      else if (names.has("requireCustomerAuth")) guard = "CUSTOMER";
      else if (names.has("requireTrackingAuth")) guard = "TRACKING";
      else guard = "PUBLIC";
      for (const method of Object.keys(layer.route.methods)) {
        out[`${method.toUpperCase()} /api${prefix}${layer.route.path === "/" ? "" : layer.route.path}`] = guard;
      }
    }
  }
  return out;
}
