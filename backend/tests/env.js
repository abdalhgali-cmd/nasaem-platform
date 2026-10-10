import dotenv from "dotenv";
import path from "path";

// CI sets DATABASE_URL / JWT_SECRET / SEED_ADMIN_PASSWORD directly as job
// env vars, so .env.test won't exist there — dotenv.config() silently no-ops
// if the file is missing, which is exactly what we want in that case.
dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

// Browsers send provenance headers (Origin / Sec-Fetch-Site) on every
// cookie-authenticated write, and the back-office's api.js also sends
// X-Requested-With. supertest sends none of them, which the CSRF protection
// (src/middleware/csrf.middleware.js) rightly treats as an untrusted write.
// Existing tests model same-origin back-office calls, so their requests get
// the same X-Requested-With header the real pages send — unless a test opts
// out with `.set("X-No-Default-Headers", "1")` to exercise the rejection.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Test = require("supertest/lib/test.js");
if (!Test.prototype.__nasaemDefaultHeaders) {
  const originalEnd = Test.prototype.end;
  Test.prototype.end = function end(fn) {
    if (this.get("X-No-Default-Headers")) {
      this.unset("X-No-Default-Headers");
    } else if (!this.get("Origin") && !this.get("X-Requested-With")) {
      this.set("X-Requested-With", "XMLHttpRequest");
    }
    return originalEnd.call(this, fn);
  };
  Test.prototype.__nasaemDefaultHeaders = true;
}
