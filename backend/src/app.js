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

// Railway (and most PaaS hosts) put the app behind a single reverse-proxy
// hop, which sets X-Forwarded-For. Without this, Express's req.ip resolves
// to the proxy's own IP for every visitor — so every IP-based rate limiter
// (below, and the public contact-requests one) was effectively rate-limiting
// all visitors combined as a single "user" instead of per-client. `1` means
// "trust exactly one hop", the specific value express-rate-limit's own
// validation recommends over the permissive (and vulnerable) `true`.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()) ?? true,
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
