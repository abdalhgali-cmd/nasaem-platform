import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import apiRouter from "./routes/index.js";
import notFoundMiddleware from "./middleware/notFound.middleware.js";
import errorMiddleware from "./middleware/error.middleware.js";
import { createCsrfProtection } from "./middleware/csrf.middleware.js";
import { createApiRateLimiter } from "./middleware/rateLimits.js";
import { trustProxyHops } from "./utils/trustProxy.js";

// Must run before the cors() call below reads process.env.CORS_ORIGIN.
// server.js used to be the only place calling dotenv.config(), before its
// own `import app from "./app.js"` — but ES module imports are resolved
// and evaluated before the importing file's own top-level statements run,
// so app.js (and this module-scope cors() call) actually executed first,
// always seeing CORS_ORIGIN as undefined. That silently forced `origin:
// false` (deny-all) no matter what CORS_ORIGIN was set to, undetected
// because the app's only real deployment target was itself same-origin
// (see the static-serving comment below), which needs no CORS headers.
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The staff back-office (login, dashboard, request intake): plain HTML/JS
// that calls this API same-origin (/api, cookie session). It lives inside
// backend/ so it ships in the same image as the API — Railway builds from
// backend/ only, so a folder at the repo root was never deployed.
const STAFF_FRONTEND_DIR = path.join(__dirname, "..", "public");

const app = express();

// Must be set before any middleware that reads req.ip (cors below doesn't,
// but the rate limiters mounted throughout this app do) — see
// utils/trustProxy.js for why this is a hop count, not `true`/`false`.
app.set("trust proxy", trustProxyHops(process.env.NODE_ENV));

// Platform 3.0 Phase 17: fails closed, not open. `cors`'s `origin: true`
// reflects whatever Origin header the request sends — combined with
// `credentials: true`, an unset CORS_ORIGIN previously meant ANY site
// could make cookie-authenticated requests against this API. `false`
// denies cross-origin requests instead (same-origin requests — the
// frontend/ back-office served by this same app — carry no Origin header
// and are unaffected either way); a misconfigured deployment now fails
// safe instead of silently granting universal CORS access.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()) ?? false,
    credentials: true,
  })
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Static back-office pages are served same-origin so the cookie-based auth
// session works without any CORS configuration. They are public shells:
// every piece of data they show comes from /api routes that enforce
// requireAuth/requireRole. Only files inside public/ are reachable; dotfiles
// are refused and there is no directory listing or index page.
app.use(express.static(STAFF_FRONTEND_DIR, { dotfiles: "deny", index: false, redirect: false }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    system: "Nasaem Platform API",
    version: "1.0.0",
    status: "running",
  });
});

// Cookie-authenticated writes must come from a trusted page; see
// middleware/csrf.middleware.js for the exact policy.
app.use("/api", createCsrfProtection());

// Per-session limit for signed-in callers, per-IP for everyone else; see
// middleware/rateLimits.js. API_RATE_LIMIT (anonymous, default 200 per 15
// minutes) and API_SESSION_RATE_LIMIT (per signed-in user, default 1500)
// can be raised for CI's browser suite without changing production.
app.use("/api", createApiRateLimiter(), apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
