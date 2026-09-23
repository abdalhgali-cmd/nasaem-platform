import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../../config/database.js";
import { resolveUploadPath, resolveStoredUploadPath } from "../../config/uploadRoot.js";

// Same shared UPLOAD_ROOT every other document module writes/reads through
// (see ../../config/uploadRoot.js) — flight booking files (provisional
// tickets, payment receipts, final tickets) used to bypass it via a
// standalone UPLOAD_DIR/env var, which meant they weren't guaranteed to
// live on the mounted persistent volume in production.
const FLIGHT_BOOKINGS_DIR = resolveUploadPath("flight-bookings");
const STATUS_LABELS_AR = { REQUESTED: "تم استلام الطلب", RESERVATION_PENDING: "جاري الحجز المبدئي", PROVISIONAL_TICKET: "تم إصدار الحجز المبدئي", PAYMENT_PENDING: "بانتظار الدفع", PAYMENT_UNDER_REVIEW: "إشعار الدفع قيد المراجعة", PAYMENT_CONFIRMED: "تم تأكيد الدفع", FINAL_TICKET_ISSUED: "تم إصدار الحجز النهائي", CANCELLED: "ملغي" };
function bookingNumber() { return `FLT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`; }
function badRequest(message) { const error = new Error(message); error.statusCode = 400; return error; }
function notFound(message) { const error = new Error(message); error.statusCode = 404; return error; }
function safeName(name) { return String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_"); }
function normalizePhone(value) { return String(value || "").replace(/[^0-9+]/g, "").replace(/^00/, "+"); }
// Writes under UPLOAD_ROOT/flight-bookings/<bookingNumber>/ and stores the
// DB path relative to UPLOAD_ROOT (e.g. "flight-bookings/FLT-.../file.pdf"),
// matching the same contract documents.service.js/contact-request-documents
// use — never an absolute path or one relative to process.cwd(), so the
// file stays reachable after a redeploy or a UPLOAD_ROOT change.
async function saveFile(file, bookingNumberValue, prefix) { if (!file) throw badRequest("File is required"); const bookingDir = path.join(FLIGHT_BOOKINGS_DIR, bookingNumberValue); await fs.mkdir(bookingDir, { recursive: true }); const filename = `${prefix}-${Date.now()}-${safeName(file.originalname)}`; const fullPath = path.join(bookingDir, filename); await fs.writeFile(fullPath, file.buffer); return { path: path.join("flight-bookings", bookingNumberValue, filename), name: file.originalname }; }
async function ensureOrderAndCustomer(input) { let customer = input.customerId ? await prisma.customer.findUnique({ where: { id: input.customerId } }) : null; if (!customer) { const passportNo = String(input.contact?.passportNo || input.passengers?.[0]?.passportNo || "").trim(); if (passportNo) customer = await prisma.customer.findUnique({ where: { passportNo } }); } if (!customer) { const passportNo = `${String(input.contact?.passportNo || input.passengers?.[0]?.passportNo || "TEMP-")}-${Date.now()}`; customer = await prisma.customer.create({ data: { customerNo: `CUS-${Date.now().toString(36).toUpperCase()}`, fullName: String(input.contact?.fullName || `${input.passengers?.[0]?.firstName || ""} ${input.passengers?.[0]?.lastName || ""}`).trim(), passportNo, nationality: String(input.passengers?.[0]?.nationality || "UNKNOWN").trim(), birthDate: input.passengers?.[0]?.birthDate ? new Date(input.passengers[0].birthDate) : null, gender: input.passengers?.[0]?.gender || null, phone: input.contact?.phone || null, email: input.contact?.email || null } }); } const order = await prisma.order.create({ data: { orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}`, customerId: customer.id, status: "NEW", paymentStatus: "UNPAID", totalAmount: Number(input.amount || 0), currency: input.currency || "SDG" } }); return { customer, order }; }
export async function createFlightBooking(input) { const flightIds = Array.isArray(input.flightIds) && input.flightIds.length ? input.flightIds.map(String) : input.flightId ? [String(input.flightId)] : []; if (!flightIds.length) throw badRequest("At least one flight is required"); if (!Array.isArray(input.passengers) || !input.passengers.length) throw badRequest("At least one passenger is required"); if (!input.contact?.phone) throw badRequest("Phone is required"); const amount = Number(input.amount); if (!Number.isFinite(amount) || amount <= 0) throw badRequest("Valid booking amount is required"); const { customer, order } = await ensureOrderAndCustomer({ ...input, amount }); const id = crypto.randomUUID(); const number = bookingNumber(); await prisma.$executeRawUnsafe(`INSERT INTO flight_bookings (id,booking_number,order_id,customer_id,flight_id,status,passengers,amount,currency,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'REQUESTED',$6::jsonb,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, number, order.id, customer.id, JSON.stringify(flightIds), JSON.stringify(input.passengers), amount, input.currency || "SDG"); return getFlightBooking(id); }
// Platform 3.0 Phase 17: shared by getFlightBooking and listFlightBookings
// so a list of N bookings maps N already-fetched rows in memory instead of
// re-querying each one individually (that re-query was the exact same JOIN
// listFlightBookings' own query already ran — a straightforward N+1).
function mapBookingRow(booking) { let flightIds = []; try { flightIds = JSON.parse(String(booking.flight_id || "[]")); if (!Array.isArray(flightIds)) flightIds = [String(booking.flight_id)]; } catch { flightIds = booking.flight_id ? [String(booking.flight_id)] : []; } return { ...booking, flightIds, statusLabel: STATUS_LABELS_AR[booking.status] || booking.status }; }
// `organizationId` is optional and only ever passed by staff-facing callers
// (routes behind requireAuth). Customer-facing callers (create, public
// lookup, receipt upload, file download) are authorized by phone match
// instead and intentionally omit it, matching getPublicFlightBooking's own
// ownership check below. When passed, a booking belonging to another
// organization is treated exactly like a nonexistent one (fails closed,
// same posture as requireContactRequestOrganization).
export async function getFlightBooking(idOrNumber, organizationId) { const params = organizationId ? [idOrNumber, organizationId] : [idOrNumber]; const rows = await prisma.$queryRawUnsafe(`SELECT fb.*, c."fullName" AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM flight_bookings fb JOIN "Customer" c ON c.id=fb.customer_id JOIN "Order" o ON o.id=fb.order_id WHERE (fb.id=$1 OR fb.booking_number=$1)${organizationId ? ` AND o."organizationId"=$2` : ""} LIMIT 1`, ...params); if (!rows[0]) return null; return mapBookingRow(rows[0]); }
export async function getPublicFlightBooking(idOrNumber, phone) { const booking = await getFlightBooking(idOrNumber); if (!booking || !phone || normalizePhone(phone) !== normalizePhone(booking.customer_phone)) return null; const accounts = ["PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED"].includes(booking.status) ? await getBankAccounts() : []; return { ...booking, bankAccounts: accounts }; }
export async function listFlightBookings(status, organizationId) { const conditions = []; const params = []; if (status) { params.push(status); conditions.push(`fb.status=$${params.length}`); } if (organizationId) { params.push(organizationId); conditions.push(`o."organizationId"=$${params.length}`); } const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""; const rows = await prisma.$queryRawUnsafe(`SELECT fb.*, c."fullName" AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM flight_bookings fb JOIN "Customer" c ON c.id=fb.customer_id JOIN "Order" o ON o.id=fb.order_id ${where} ORDER BY fb.created_at DESC LIMIT 200`, ...params); return rows.map(mapBookingRow); }
export async function uploadProvisionalTicket(id, file, organizationId) { const booking = await getFlightBooking(id, organizationId); if (!booking) throw notFound("Booking not found"); if (!["REQUESTED", "RESERVATION_PENDING"].includes(booking.status)) throw badRequest("Provisional ticket can only be uploaded for a new booking"); const saved = await saveFile(file, booking.booking_number, "provisional-ticket"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='PAYMENT_PENDING', provisional_ticket_path=$2, provisional_ticket_name=$3, provisional_ticket_uploaded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, saved.path, saved.name); await prisma.order.update({ where: { id: booking.order_id }, data: { status: "PROCESSING", paymentStatus: "UNPAID" } }); return getFlightBooking(booking.id); }
export async function submitPaymentReceipt(id, file, phone) { const booking = await getFlightBooking(id); if (!booking) throw notFound("Booking not found"); if (!phone || normalizePhone(phone) !== normalizePhone(booking.customer_phone)) throw badRequest("بيانات التحقق غير صحيحة"); if (booking.status !== "PAYMENT_PENDING") throw badRequest("لا يمكن رفع إشعار الدفع في هذه المرحلة"); if (!(await getBankAccounts()).length) throw badRequest("لا يوجد حساب دفع نشط حاليًا"); const saved = await saveFile(file, booking.booking_number, "payment-receipt"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='PAYMENT_UNDER_REVIEW', payment_receipt_path=$2, payment_receipt_name=$3, payment_receipt_uploaded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, saved.path, saved.name); return getFlightBooking(booking.id); }
export async function confirmPayment(id, userId, note, organizationId) { const booking = await getFlightBooking(id, organizationId); if (!booking) throw notFound("Booking not found"); if (booking.status !== "PAYMENT_UNDER_REVIEW") throw badRequest("Payment receipt must be reviewed before confirmation"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='PAYMENT_CONFIRMED', payment_review_note=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, note || null); await prisma.payment.create({ data: { orderId: booking.order_id, amount: booking.amount, currency: booking.currency, paymentMethod: "BANK_TRANSFER", status: "PAID", paidAt: new Date() } }); await prisma.order.update({ where: { id: booking.order_id }, data: { status: "PROCESSING", paymentStatus: "PAID" } }); return getFlightBooking(booking.id); }
export async function issueFinalTicket(id, file, organizationId) { const booking = await getFlightBooking(id, organizationId); if (!booking) throw notFound("Booking not found"); if (booking.status !== "PAYMENT_CONFIRMED") throw badRequest("Payment must be confirmed before final ticket issuance"); const saved = await saveFile(file, booking.booking_number, "final-ticket"); await prisma.$executeRawUnsafe(`UPDATE flight_bookings SET status='FINAL_TICKET_ISSUED', final_ticket_path=$2, final_ticket_name=$3, final_ticket_uploaded_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, booking.id, saved.path, saved.name); await prisma.order.update({ where: { id: booking.order_id }, data: { status: "COMPLETED" } }); return getFlightBooking(booking.id); }
export async function getBankAccounts() { return prisma.$queryRawUnsafe(`SELECT id,key,label,account_number,bank_name,active FROM flight_bank_accounts WHERE active=true ORDER BY label`); }
export async function upsertBankAccount(input) { if (!input.key || !input.label || !input.accountNumber) throw badRequest("key, label and accountNumber are required"); const id = input.id || crypto.randomUUID(); await prisma.$executeRawUnsafe(`INSERT INTO flight_bank_accounts (id,key,label,account_number,bank_name,active) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label,account_number=EXCLUDED.account_number,bank_name=EXCLUDED.bank_name,active=EXCLUDED.active,updated_at=CURRENT_TIMESTAMP`, id, input.key, input.label, input.accountNumber, input.bankName || null, input.active !== false); return (await prisma.$queryRawUnsafe(`SELECT id,key,label,account_number,bank_name,active FROM flight_bank_accounts WHERE key=$1 LIMIT 1`, input.key))[0]; }
// `requirePhoneMatch: true` is the customer-facing path (this booking's own
// documents only, verified the same way getPublicFlightBooking/
// submitPaymentReceipt already verify ownership); staff callers (the admin
// route, already behind requireAuth+role) pass false since they're allowed
// to see any booking's files.
export async function getBookingFile(idOrNumber, kind, { phone, requirePhoneMatch, organizationId } = {}) {
  const booking = await getFlightBooking(idOrNumber, organizationId);
  if (!booking) throw notFound("Booking not found");
  if (requirePhoneMatch) {
    if (!phone || normalizePhone(phone) !== normalizePhone(booking.customer_phone)) throw notFound("Booking not found");
  }
  const field = kind === "provisional" ? "provisional_ticket_path" : kind === "receipt" ? "payment_receipt_path" : kind === "final" ? "final_ticket_path" : null;
  if (!field || !booking[field]) throw new Error("File not available");
  // resolveStoredUploadPath maps both the new "flight-bookings/..." shape
  // and the historical "uploads/flight-bookings/..." / absolute-under-cwd
  // shape this module used to store onto the current UPLOAD_ROOT, and
  // throws on anything that would resolve outside it (traversal, an
  // unrelated absolute path).
  const absolute = resolveStoredUploadPath(booking[field]);
  return { path: absolute, name: booking[field.replace("_path", "_name")] || path.basename(absolute) };
}
