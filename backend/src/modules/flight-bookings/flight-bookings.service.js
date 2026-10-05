import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../../config/database.js";
import { resolveUploadPath, resolveStoredUploadPath } from "../../config/uploadRoot.js";
import { ALLOWED_MIME_TYPES, detectMimeTypeFromSignature } from "../../middleware/upload.middleware.js";
import { Decimal } from "../../utils/money.js";
import { generateCustomerNo } from "../customers/customers.service.js";
import { generateOrderNumber } from "../orders/orders.service.js";
import { normalizePhone as normalizeTrackingPhone } from "../../utils/phone.js";

// Same shared UPLOAD_ROOT every other document module writes/reads through
// (see ../../config/uploadRoot.js) — flight booking files (provisional
// tickets, payment receipts, final tickets) used to bypass it via a
// standalone UPLOAD_DIR/env var, which meant they weren't guaranteed to
// live on the mounted persistent volume in production.
const FLIGHT_BOOKINGS_DIR = resolveUploadPath("flight-bookings");
const STATUS_LABELS_AR = { REQUESTED: "تم استلام الطلب", RESERVATION_PENDING: "جاري الحجز المبدئي", PROVISIONAL_TICKET: "تم إصدار الحجز المبدئي", PAYMENT_PENDING: "بانتظار الدفع", PAYMENT_UNDER_REVIEW: "إشعار الدفع قيد المراجعة", PAYMENT_CONFIRMED: "تم تأكيد الدفع", FINAL_TICKET_ISSUED: "تم إصدار الحجز النهائي", CANCELLED: "ملغي" };
function bookingNumber() { return `FLT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`; }
function badRequest(message) { const error = new Error(message); error.statusCode = 400; return error; }
function notFound(message) { const error = new Error(message); error.statusCode = 404; return error; }
// Writes under UPLOAD_ROOT/flight-bookings/<bookingNumber>/ and stores the
// DB path relative to UPLOAD_ROOT (e.g. "flight-bookings/FLT-.../file.pdf"),
// matching the same contract documents.service.js/contact-request-documents
// use — never an absolute path or one relative to process.cwd(), so the
// file stays reachable after a redeploy or a UPLOAD_ROOT change.
// Every upload (customer receipt, staff tickets) passes the same magic-byte
// check as the rest of the platform (JPEG/PNG/WEBP/PDF only). The stored name
// is generated here — the client's file name and extension are never trusted.
function validateUpload(file) {
  if (!file || !file.buffer?.length) throw badRequest("File is required");
  const detected = detectMimeTypeFromSignature(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected)) throw badRequest("نوع الملف غير مدعوم. الأنواع المسموحة: JPEG وPNG وWEBP وPDF.");
  return { buffer: file.buffer, ext: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[detected] };
}
async function saveFile(file, bookingNumberValue, prefix) { const { buffer, ext } = validateUpload(file); const bookingDir = path.join(FLIGHT_BOOKINGS_DIR, bookingNumberValue); await fs.mkdir(bookingDir, { recursive: true }); const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`; await fs.writeFile(path.join(bookingDir, filename), buffer); return { path: path.join("flight-bookings", bookingNumberValue, filename), name: `${bookingNumberValue}-${prefix}.${ext}` }; }
const MAX_PASSENGERS = 20;
const MAX_FLIGHTS = 6;
const text = (value, max = 120) => String(value ?? "").trim().slice(0, max);
function cleanPassenger(raw) {
  const passenger = {};
  for (const key of ["firstName", "lastName", "birthDate", "gender", "nationality", "passportNo", "passportIssueDate", "passportExpiryDate", "passportIssueCountry", "passengerType"]) passenger[key] = text(raw?.[key]);
  if (!passenger.firstName || !passenger.lastName) throw badRequest("Each passenger needs a first and last name");
  return passenger;
}
// A public booking NEVER attaches to a pre-existing customer, whatever
// customerId / passportNo the request carries: that would let an anonymous
// caller put fabricated orders on a stranger's record and read their details
// back. A fresh customer row is created (passportNo stays NULL — a unique
// column, so no collision); staff can merge duplicates later.
async function createCustomerAndOrder({ contact, passengers, amount }) {
  const first = passengers[0];
  const birthDate = first.birthDate && !Number.isNaN(Date.parse(first.birthDate)) ? new Date(first.birthDate) : null;
  const gender = ["MALE", "FEMALE", "OTHER"].includes(first.gender?.toUpperCase()) ? first.gender.toUpperCase() : null;
  const customer = await prisma.customer.create({ data: { customerNo: await generateCustomerNo(), fullName: text(contact.fullName, 200) || `${first.firstName} ${first.lastName}`, passportNo: null, nationality: first.nationality || "UNKNOWN", birthDate, gender, phone: text(contact.phone, 30), email: text(contact.email, 200) || null } });
  const order = await prisma.order.create({ data: { orderNumber: await generateOrderNumber(), customerId: customer.id, status: "NEW", paymentStatus: "UNPAID", totalAmount: amount, currency: "SDG" } });
  return { customer, order };
}
// The price is computed HERE from the flight inventory (price_sdg is per person;
// the booking is priced for every passenger). Whatever amount/currency/customerId
// the request carries is ignored. Only manually-priced inventory flights can be
// booked online: a live-provider fare has no stored quote to price against.
export async function createFlightBooking(input) {
  const requested = Array.isArray(input.flightIds) && input.flightIds.length ? input.flightIds : input.flightId ? [input.flightId] : [];
  const flightIds = [...new Set(requested.map((id) => text(id, 80)).filter(Boolean))];
  if (!flightIds.length || flightIds.length > MAX_FLIGHTS) throw badRequest("At least one flight is required");
  if (!Array.isArray(input.passengers) || !input.passengers.length || input.passengers.length > MAX_PASSENGERS) throw badRequest("At least one passenger is required");
  if (!text(input.contact?.phone, 30)) throw badRequest("Phone is required");
  const passengers = input.passengers.map(cleanPassenger);

  const flights = await prisma.$queryRawUnsafe(`SELECT id, price_sdg, available_seats FROM flight_inventory WHERE id = ANY($1::text[]) AND active = true`, flightIds);
  if (flights.length !== flightIds.length) throw badRequest("One or more selected flights are not available for online booking");
  if (flights.some((flight) => flight.price_sdg == null)) throw badRequest("A selected flight has no bookable price");
  if (flights.some((flight) => flight.available_seats != null && Number(flight.available_seats) < passengers.length)) throw badRequest("Not enough seats available on a selected flight");
  const amount = flights.reduce((sum, flight) => sum.plus(new Decimal(String(flight.price_sdg)).mul(passengers.length)), new Decimal(0));
  if (amount.lessThanOrEqualTo(0)) throw badRequest("A selected flight has no bookable price");

  const { customer, order } = await createCustomerAndOrder({ contact: input.contact, passengers, amount });
  const id = crypto.randomUUID();
  const number = bookingNumber();
  const accessToken = crypto.randomBytes(32).toString("base64url");
  await prisma.$executeRawUnsafe(`INSERT INTO flight_bookings (id,booking_number,order_id,customer_id,flight_id,status,passengers,amount,currency,access_token_hash,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'REQUESTED',$6::jsonb,$7::numeric,'SDG',$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, number, order.id, customer.id, JSON.stringify(flightIds), JSON.stringify(passengers), amount.toFixed(2), hashToken(accessToken));
  return { booking: toPublicView(await getFlightBooking(id)), accessToken };
}
// Platform 3.0 Phase 17: shared by getFlightBooking and listFlightBookings
// so a list of N bookings maps N already-fetched rows in memory instead of
// re-querying each one individually (that re-query was the exact same JOIN
// listFlightBookings' own query already ran — a straightforward N+1).
// The stored token hash and the server-side storage paths never leave the API:
// callers get has* flags instead (see toPublicView for the customer view).
function mapBookingRow(booking) { let flightIds = []; try { flightIds = JSON.parse(String(booking.flight_id || "[]")); if (!Array.isArray(flightIds)) flightIds = [String(booking.flight_id)]; } catch { flightIds = booking.flight_id ? [String(booking.flight_id)] : []; } const { access_token_hash: _tokenHash, ...rest } = booking; return { ...rest, flightIds, statusLabel: STATUS_LABELS_AR[booking.status] || booking.status }; }
// `organizationId` is optional and only ever passed by staff-facing callers
// (routes behind requireAuth). Customer-facing callers (create, public
// lookup, receipt upload, file download) are authorized by phone match
// instead and intentionally omit it, matching getPublicFlightBooking's own
// ownership check below. When passed, a booking belonging to another
// organization is treated exactly like a nonexistent one (fails closed,
// same posture as requireContactRequestOrganization).
export async function getFlightBooking(idOrNumber, organizationId) { const params = organizationId ? [idOrNumber, organizationId] : [idOrNumber]; const rows = await prisma.$queryRawUnsafe(`SELECT fb.*, c."fullName" AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM flight_bookings fb JOIN "Customer" c ON c.id=fb.customer_id JOIN "Order" o ON o.id=fb.order_id WHERE (fb.id=$1 OR fb.booking_number=$1)${organizationId ? ` AND o."organizationId"=$2` : ""} LIMIT 1`, ...params); if (!rows[0]) return null; return mapBookingRow(rows[0]); }
function hashToken(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
// Customer view: no storage paths, no stored hash, no e-mail — just what the
// booking page renders.
function toPublicView(booking) { const { provisional_ticket_path, payment_receipt_path, final_ticket_path, customer_email: _email, customer_phone: _phone, ...rest } = booking; return { ...rest, hasProvisionalTicket: Boolean(provisional_ticket_path), hasPaymentReceipt: Boolean(payment_receipt_path), hasFinalTicket: Boolean(final_ticket_path) }; }
// Who may act on a booking as its customer:
//   * the holder of the booking's access token (returned once, at creation), or
//   * a phone-verified tracking session (OTP) whose phone is the booking's.
// Any failure is reported as "not found" so nothing about existence leaks.
export async function authorizeBookingAccess(idOrNumber, { token, trackingPhone } = {}) {
  const booking = await getFlightBooking(idOrNumber);
  if (!booking) return null;
  if (token) {
    const rows = await prisma.$queryRawUnsafe(`SELECT access_token_hash FROM flight_bookings WHERE id=$1`, booking.id);
    const stored = rows[0]?.access_token_hash;
    if (stored) {
      const a = Buffer.from(stored, "hex");
      const b = Buffer.from(hashToken(token), "hex");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return booking;
    }
  }
  if (trackingPhone && normalizeTrackingPhone(booking.customer_phone) === trackingPhone) return booking;
  return null;
}
export async function getPublicFlightBooking(booking) { const accounts = ["PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED"].includes(booking.status) ? await getBankAccounts() : []; return { ...toPublicView(booking), bankAccounts: accounts }; }
export async function listFlightBookings(status, organizationId) { const conditions = []; const params = []; if (status) { params.push(status); conditions.push(`fb.status=$${params.length}`); } if (organizationId) { params.push(organizationId); conditions.push(`o."organizationId"=$${params.length}`); } const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""; const rows = await prisma.$queryRawUnsafe(`SELECT fb.*, c."fullName" AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM flight_bookings fb JOIN "Customer" c ON c.id=fb.customer_id JOIN "Order" o ON o.id=fb.order_id ${where} ORDER BY fb.created_at DESC LIMIT 200`, ...params); return rows.map(mapBookingRow); }
export async function uploadProvisionalTicket(id, file, organizationId) { const booking = await getFlightBooking(id, organizationId); if (!booking) throw notFound("Booking not found"); if (!["REQUESTED", "RESERVATION_PENDING"].includes(booking.status)) throw badRequest("Provisional ticket can only be uploaded for a new booking"); const saved = await saveFile(file, booking.booking_number, "provisional-ticket"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='PAYMENT_PENDING', provisional_ticket_path=$2, provisional_ticket_name=$3, provisional_ticket_uploaded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, saved.path, saved.name); await prisma.order.update({ where: { id: booking.order_id }, data: { status: "PROCESSING", paymentStatus: "UNPAID" } }); return getFlightBooking(booking.id); }
// `booking` was already authorised by authorizeBookingAccess.
export async function submitPaymentReceipt(booking, file) { if (booking.status !== "PAYMENT_PENDING") throw badRequest("لا يمكن رفع إشعار الدفع في هذه المرحلة"); if (!(await getBankAccounts()).length) throw badRequest("لا يوجد حساب دفع نشط حاليًا"); const saved = await saveFile(file, booking.booking_number, "payment-receipt"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='PAYMENT_UNDER_REVIEW', payment_receipt_path=$2, payment_receipt_name=$3, payment_receipt_uploaded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, saved.path, saved.name); return getFlightBooking(booking.id); }
export async function confirmPayment(id, userId, note, organizationId) { const booking = await getFlightBooking(id, organizationId); if (!booking) throw notFound("Booking not found"); if (booking.status !== "PAYMENT_UNDER_REVIEW") throw badRequest("Payment receipt must be reviewed before confirmation"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='PAYMENT_CONFIRMED', payment_review_note=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, note || null); await prisma.payment.create({ data: { orderId: booking.order_id, amount: booking.amount, currency: booking.currency, fxRate: 1, convertedAmount: booking.amount, paymentMethod: "BANK_TRANSFER", status: "PAID", paidAt: new Date() } }); await prisma.order.update({ where: { id: booking.order_id }, data: { status: "PROCESSING", paymentStatus: "PAID" } }); return getFlightBooking(booking.id); }
export async function issueFinalTicket(id, file, organizationId) { const booking = await getFlightBooking(id, organizationId); if (!booking) throw notFound("Booking not found"); if (booking.status !== "PAYMENT_CONFIRMED") throw badRequest("Payment must be confirmed before final ticket issuance"); const saved = await saveFile(file, booking.booking_number, "final-ticket"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='FINAL_TICKET_ISSUED', final_ticket_path=$2, final_ticket_name=$3, final_ticket_uploaded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, saved.path, saved.name); await prisma.order.update({ where: { id: booking.order_id }, data: { status: "COMPLETED" } }); return getFlightBooking(booking.id); }
export async function getBankAccounts() { return prisma.$queryRawUnsafe(`SELECT id,key,label,account_number,bank_name,active FROM flight_bank_accounts WHERE active=true ORDER BY label`); }
export async function upsertBankAccount(input) { if (!input.key || !input.label || !input.accountNumber) throw badRequest("key, label and accountNumber are required"); const id = input.id || crypto.randomUUID(); await prisma.$executeRawUnsafe(`INSERT INTO flight_bank_accounts (id,key,label,account_number,bank_name,active) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label,account_number=EXCLUDED.account_number,bank_name=EXCLUDED.bank_name,active=EXCLUDED.active,updated_at=CURRENT_TIMESTAMP`, id, input.key, input.label, input.accountNumber, input.bankName || null, input.active !== false); return (await prisma.$queryRawUnsafe(`SELECT id,key,label,account_number,bank_name,active FROM flight_bank_accounts WHERE key=$1 LIMIT 1`, input.key))[0]; }
// `requirePhoneMatch: true` is the customer-facing path (this booking's own
// documents only, verified the same way getPublicFlightBooking/
// submitPaymentReceipt already verify ownership); staff callers (the admin
// route, already behind requireAuth+role) pass false since they're allowed
// to see any booking's files.
// Staff path only (behind requireAuth + role, organisation-scoped). The customer
// path authorises via authorizeBookingAccess and then calls resolveBookingFile.
export async function getBookingFile(idOrNumber, kind, { organizationId } = {}) {
  const booking = await getFlightBooking(idOrNumber, organizationId);
  if (!booking) throw notFound("Booking not found");
  return resolveBookingFile(booking, kind);
}
export function resolveBookingFile(booking, kind) {
  const field = kind === "provisional" ? "provisional_ticket_path" : kind === "receipt" ? "payment_receipt_path" : kind === "final" ? "final_ticket_path" : null;
  if (!field || !booking[field]) throw notFound("File not available");
  // resolveStoredUploadPath maps both the new "flight-bookings/..." shape and
  // the historical shapes onto the current UPLOAD_ROOT and throws on anything
  // that would resolve outside it.
  const absolute = resolveStoredUploadPath(booking[field]);
  return { path: absolute, name: booking[field.replace("_path", "_name")] || path.basename(absolute) };
}
