import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { verifyTrackingToken } from "../../utils/jwt.js";
import {
  authorizeBookingAccess,
  confirmPayment,
  createFlightBooking,
  getBankAccounts,
  getBookingFile,
  getFlightBooking,
  getPublicFlightBooking,
  issueFinalTicket,
  listFlightBookings,
  resolveBookingFile,
  submitPaymentReceipt,
  uploadProvisionalTicket,
  upsertBankAccount,
} from "./flight-bookings.service.js";

const router = Router();

// Memory storage + the shared magic-byte validation in the service (only
// JPEG/PNG/WEBP/PDF are ever written to disk).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const singleFile = (req, res, next) =>
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({ success: false, message: tooLarge ? "الملف أكبر من الحد المسموح (10MB)" : error.message || "File upload failed" });
  });

// FLIGHT_BOOKING_*_LIMIT only exist so test suites that make many calls from one
// IP can relax them; production uses the defaults.
const envLimit = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const limiter = (limit, message) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { success: false, message } });

const createLimiter = limiter(envLimit("FLIGHT_BOOKING_CREATE_LIMIT", 10), "Too many booking requests. Please try again later.");
const uploadLimiter = limiter(envLimit("FLIGHT_BOOKING_UPLOAD_LIMIT", 10), "Too many uploads. Please try again later.");
// Counts only FAILED customer lookups (skipSuccessfulRequests), so the booking
// page can keep polling its own booking while token guessing is throttled.
const failedAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit("FLIGHT_BOOKING_BAD_TOKEN_LIMIT", 20),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many failed attempts. Please try again later." },
});

function trackingPhoneFrom(req) {
  const authorization = req.headers.authorization;
  const bearer = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  const token = bearer || req.cookies?.trackingAccessToken;
  if (!token) return undefined;
  try {
    return verifyTrackingToken(token).sub;
  } catch {
    return undefined;
  }
}

// Customer-side authorisation (see authorizeBookingAccess). Failure is always a
// plain 404 so a caller learns nothing about which bookings exist.
async function customerAccess(req, res, next) {
  try {
    const booking = await authorizeBookingAccess(req.params.id, { token: req.get("x-booking-token") || undefined, trackingPhone: trackingPhoneFrom(req) });
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    req.booking = booking;
    return next();
  } catch (error) {
    return next(error);
  }
}

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

// --- Public / customer endpoints -------------------------------------------
router.post("/", createLimiter, handle(async (req, res) => {
  const { booking, accessToken } = await createFlightBooking(req.body ?? {});
  // The token is shown ONCE; only its hash is stored. The customer keeps it
  // (the booking page stores it in sessionStorage / the follow-up link).
  res.status(201).json({ success: true, booking, accessToken });
}));

router.get("/bank-accounts", handle(async (req, res) => {
  res.json({ success: true, accounts: await getBankAccounts() });
}));

router.get("/public/:id", failedAccessLimiter, customerAccess, handle(async (req, res) => {
  res.json({ success: true, booking: await getPublicFlightBooking(req.booking) });
}));

router.post("/:id/payment-receipt", failedAccessLimiter, uploadLimiter, customerAccess, singleFile, handle(async (req, res) => {
  const booking = await submitPaymentReceipt(req.booking, req.file);
  res.json({ success: true, booking: await getPublicFlightBooking(booking) });
}));

router.get("/:id/file/:kind", failedAccessLimiter, customerAccess, handle(async (req, res) => {
  const file = resolveBookingFile(req.booking, req.params.kind);
  res.download(file.path, file.name);
}));

// --- Staff endpoints --------------------------------------------------------
router.use(requireAuth);
const staff = requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT");

router.get("/:id", staff, handle(async (req, res) => {
  const booking = await getFlightBooking(req.params.id, req.user.organizationId);
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
  res.json({ success: true, booking });
}));
router.get("/:id/staff-file/:kind", staff, handle(async (req, res) => {
  const file = await getBookingFile(req.params.id, req.params.kind, { organizationId: req.user.organizationId });
  res.download(file.path, file.name);
}));
router.get("/admin/list", staff, handle(async (req, res) => {
  res.json({ success: true, bookings: await listFlightBookings(req.query.status, req.user.organizationId) });
}));
router.get("/admin/bank-accounts", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), handle(async (req, res) => {
  res.json({ success: true, accounts: await getBankAccounts() });
}));
router.post("/admin/bank-accounts", requireRole("SUPER_ADMIN", "ADMIN"), handle(async (req, res) => {
  res.status(201).json({ success: true, account: await upsertBankAccount(req.body) });
}));
router.post("/:id/provisional-ticket", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), singleFile, handle(async (req, res) => {
  res.json({ success: true, booking: await uploadProvisionalTicket(req.params.id, req.file, req.user.organizationId) });
}));
router.post("/:id/confirm-payment", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), handle(async (req, res) => {
  res.json({ success: true, booking: await confirmPayment(req.params.id, req.user?.id, req.body.note, req.user.organizationId) });
}));
router.post("/:id/final-ticket", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), singleFile, handle(async (req, res) => {
  res.json({ success: true, booking: await issueFinalTicket(req.params.id, req.file, req.user.organizationId) });
}));

export default router;
