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
// backend/src/app.js -> repo root/frontend
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");

const app = express();

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
