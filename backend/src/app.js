import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import apiRouter from "./routes/index.js";
import notFoundMiddleware from "./middleware/notFound.middleware.js";
import errorMiddleware from "./middleware/error.middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/app.js -> backend/frontend. Lives inside backend/ (not as a
// repo-root sibling) specifically so it's included when only backend/ is
// used as the deploy build context (e.g. Railway's "Root Directory" or
// docker-compose's `context: ./backend`) — a sibling directory outside that
// root is invisible to the build, which was silently 404ing every staff
// page (login.html, admin-dashboard.html, ...) in production.
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const app = express();

// Railway (and most PaaS hosts) put the app behind a single reverse-proxy
// hop, which sets X-Forwarded-For. Without this, Express's req.ip resolves
// to the proxy's own IP for every visitor — so every IP-based rate limiter
// (below, and the public contact-requests one) was effectively rate-limiting
// all visitors combined as a single "user" instead of per-client. `1` means
// "trust exactly one hop", the specific value express-rate-limit's own
// validation recommends over the permissive (and vulnerable) `true`.
app.set("trust proxy", 1);

// A missing CORS_ORIGIN must not silently fall open in production: reflecting
// any Origin with credentials:true would let any site ride an authenticated
// session. Development keeps the permissive default for convenience — every
// real .env* file in this repo already sets CORS_ORIGIN, so this only bites
// a future deployment that forgets to.
function resolveCorsOrigin() {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("CORS_ORIGIN is not set — blocking all cross-origin requests.");
    return false;
  }
  return true;
}

app.use(
  cors({
    origin: resolveCorsOrigin(),
    credentials: true,
  })
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Static frontend pages (login/request/dashboard) are served same-origin so
// the cookie-based auth session works without any CORS configuration.
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.json({
    success: true,
    system: "Nasaem Platform API",
    version: "1.0.0",
    status: "running",
  });
});

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  apiRouter
);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
