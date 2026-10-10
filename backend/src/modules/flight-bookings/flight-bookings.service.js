import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import prismaPackage from "@prisma/client";
import prisma from "../../config/database.js";
import { resolveUploadPath, resolveStoredUploadPath } from "../../config/uploadRoot.js";
import { publicOrganizationId } from "../../utils/publicOrganization.js";
import { detectMimeTypeFromSignature, ALLOWED_MIME_TYPES } from "../../middleware/upload.middleware.js";
import { lockOrder, recalculateOrderPaymentStatus } from "../payments/payments.service.js";

const { Prisma } = prismaPackage;

// Same shared UPLOAD_ROOT every other document module writes/reads through
// (see ../../config/uploadRoot.js) — flight booking files (provisional
// tickets, payment receipts, final tickets) used to bypass it via a
// standalone UPLOAD_DIR/env var, which meant they weren't guaranteed to
// live on the mounted persistent volume in production.
const FLIGHT_BOOKINGS_DIR = resolveUploadPath("flight-bookings");
const STATUS_LABELS_AR = {
  REQUESTED: "تم استلام الطلب",
  RESERVATION_PENDING: "جاري الحجز المبدئي",
  PROVISIONAL_TICKET: "تم إصدار الحجز المبدئي",
  PAYMENT_PENDING: "بانتظار الدفع",
  PAYMENT_UNDER_REVIEW: "إشعار الدفع قيد المراجعة",
  PAYMENT_CONFIRMED: "تم تأكيد الدفع",
  FINAL_TICKET_ISSUED: "تم إصدار الحجز النهائي",
  CANCELLED: "ملغي",
};
const EXTENSION_BY_MIME = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

function bookingNumber() {
  return `FLT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}
function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}
const badRequest = (message, code) => httpError(400, message, code);
const notFound = (message) => httpError(404, message);
function normalizePhone(value) {
  return String(value || "").replace(/[^0-9+]/g, "").replace(/^00/, "+");
}

// Tickets and receipts must really be a PDF or an image: the type is taken
// from the file's own bytes (not its name or declared type), the same rule
// every other document upload in this backend uses. The stored name gets
// the extension of the detected type.
function validateTicketFile(file) {
  if (!file) throw badRequest("الملف مطلوب", "FILE_REQUIRED");
  const detected = detectMimeTypeFromSignature(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
    throw badRequest("نوع الملف غير مدعوم. الأنواع المسموحة: PDF وJPEG وPNG وWEBP.", "UNSUPPORTED_FILE_TYPE");
  }
  return detected;
}

// Writes under UPLOAD_ROOT/flight-bookings/<bookingNumber>/ and stores the
// DB path relative to UPLOAD_ROOT (e.g. "flight-bookings/FLT-.../file.pdf"),
// matching the same contract documents.service.js/contact-request-documents
// use — never an absolute path or one relative to process.cwd(), so the
// file stays reachable after a redeploy or a UPLOAD_ROOT change.
async function saveFile(file, bookingNumberValue, prefix) {
  const mimeType = validateTicketFile(file);
  const bookingDir = path.join(FLIGHT_BOOKINGS_DIR, bookingNumberValue);
  await fs.mkdir(bookingDir, { recursive: true });
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${EXTENSION_BY_MIME[mimeType]}`;
  const fullPath = path.join(bookingDir, filename);
  await fs.writeFile(fullPath, file.buffer);
  const displayName = String(file.originalname || filename).replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 120);
  return { path: path.join("flight-bookings", bookingNumberValue, filename), name: displayName, fullPath };
}

// A staff action and a file write must not leave a stray file behind when
// the booking moved on in the meantime (another staff member acted first).
async function discard(saved) {
  try {
    await fs.unlink(saved.fullPath);
  } catch {
    // best effort
  }
}

// Runs `UPDATE flight_bookings ... WHERE id=$1 AND status IN (...)`. Zero rows
// means the booking is no longer in an allowed state (a concurrent action
// already moved it), which is a 409, never a silent double transition.
async function transition(db, bookingId, allowedStatuses, setSql, params) {
  const rows = await db.$queryRawUnsafe(
    `UPDATE flight_bookings SET ${setSql}, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status = ANY($2::text[]) RETURNING id`,
    bookingId,
    allowedStatuses,
    ...params
  );
  if (rows.length === 0) {
    throw httpError(409, "تغيّرت حالة الحجز. أعد تحميل الصفحة ثم حاول مرة أخرى.", "BOOKING_STATE_CHANGED");
  }
}

// The price comes from the flight inventory, never from the request: a
// booking costs the sum of its selected segments' SDG prices (the same
// rule the booking page displays). A client-sent amount that no longer
// matches (price or FX rate changed since the page loaded) is refused so
// the customer sees the current price instead of being charged another.
async function priceFlights(flightIds) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, active, price_sdg FROM flight_inventory WHERE id = ANY($1::text[])`,
    flightIds
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  let total = new Prisma.Decimal(0);
  for (const id of flightIds) {
    const row = byId.get(id);
    if (!row || !row.active) throw badRequest("إحدى الرحلات المختارة غير متاحة.", "FLIGHT_UNAVAILABLE");
    if (row.price_sdg === null || row.price_sdg === undefined) throw badRequest("إحدى الرحلات المختارة بلا سعر صالح.", "FLIGHT_UNPRICED");
    total = total.plus(row.price_sdg);
  }
  return total.toDecimalPlaces(2);
}

function validatePassengers(passengers) {
  if (!Array.isArray(passengers) || passengers.length === 0) throw badRequest("At least one passenger is required");
  if (passengers.length > 9) throw badRequest("الحد الأقصى 9 مسافرين في الحجز الواحد.");
  for (const p of passengers) {
    if (!p || !String(p.firstName || "").trim() || !String(p.lastName || "").trim() || !String(p.passportNo || "").trim()) {
      throw badRequest("أكمل بيانات المسافرين (الاسم ورقم الجواز).");
    }
  }
}

// Public booking: the customer and the order belong to the public
// organization. A client-supplied customerId is never trusted (this route is
// unauthenticated: honouring it would attach the booking, and the phone
// check that protects its documents, to someone else's record).
async function ensureOrderAndCustomer(tx, input, amount) {
  const organizationId = publicOrganizationId();
  const first = input.passengers[0];
  const passportNo = String(input.contact?.passportNo || first?.passportNo || "").trim();
  let customer = passportNo ? await tx.customer.findFirst({ where: { passportNo, organizationId } }) : null;
  if (!customer) {
    const passportTaken = passportNo ? await tx.customer.findUnique({ where: { passportNo }, select: { id: true } }) : null;
    customer = await tx.customer.create({
      data: {
        organizationId,
        customerNo: `CUS-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
        fullName: String(input.contact?.fullName || `${first?.firstName || ""} ${first?.lastName || ""}`).trim().slice(0, 200),
        passportNo: passportNo && !passportTaken ? passportNo : `${passportNo || "TEMP"}-${Date.now()}`,
        nationality: String(first?.nationality || "UNKNOWN").trim().slice(0, 80),
        birthDate: first?.birthDate ? new Date(first.birthDate) : null,
        gender: ["MALE", "FEMALE"].includes(first?.gender) ? first.gender : null,
        phone: input.contact?.phone || null,
        email: input.contact?.email || null,
      },
    });
  }
  const order = await tx.order.create({
    data: {
      organizationId,
      orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      customerId: customer.id,
      status: "NEW",
      paymentStatus: "UNPAID",
      totalAmount: amount,
      currency: "SDG",
    },
  });
  return { customer, order };
}

export async function createFlightBooking(input) {
  const flightIds = Array.isArray(input.flightIds) && input.flightIds.length ? input.flightIds.map(String) : input.flightId ? [String(input.flightId)] : [];
  if (!flightIds.length) throw badRequest("At least one flight is required");
  if (flightIds.length > 6) throw badRequest("عدد القطاعات كبير جدًا.");
  validatePassengers(input.passengers);
  if (!input.contact?.phone) throw badRequest("Phone is required");
  if (input.currency && input.currency !== "SDG") throw badRequest("أسعار حجوزات الطيران بالجنيه السوداني فقط.", "CURRENCY_MISMATCH");

  const amount = await priceFlights(flightIds);
  if (input.amount !== undefined && input.amount !== null && !new Prisma.Decimal(Number(input.amount) || 0).toDecimalPlaces(2).equals(amount)) {
    throw httpError(409, `تغيّر سعر الرحلة. السعر الحالي ${amount.toFixed(2)} ج.س — راجع الحجز وأعد الإرسال.`, "PRICE_CHANGED");
  }

  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    const { customer, order } = await ensureOrderAndCustomer(tx, input, amount);
    await tx.$executeRawUnsafe(
      `INSERT INTO flight_bookings (id,booking_number,order_id,customer_id,flight_id,status,passengers,amount,currency,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'REQUESTED',$6::jsonb,$7::numeric,'SDG',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id, bookingNumber(), order.id, customer.id, JSON.stringify(flightIds), JSON.stringify(input.passengers), amount.toFixed(2)
    );
  });
  return getPublicFlightBookingView(await getFlightBooking(id));
}

// Platform 3.0 Phase 17: shared by getFlightBooking and listFlightBookings
// so a list of N bookings maps N already-fetched rows in memory instead of
// re-querying each one individually.
function mapBookingRow(booking) {
  let flightIds = [];
  try {
    flightIds = JSON.parse(String(booking.flight_id || "[]"));
    if (!Array.isArray(flightIds)) flightIds = [String(booking.flight_id)];
  } catch {
    flightIds = booking.flight_id ? [String(booking.flight_id)] : [];
  }
  return { ...booking, flightIds, statusLabel: STATUS_LABELS_AR[booking.status] || booking.status };
}

// `organizationId` is optional and only ever passed by staff-facing callers
// (routes behind requireAuth). Customer-facing callers (create, public
// lookup, receipt upload, file download) are authorized by phone match
// instead. When passed, a booking belonging to another organization is
// treated exactly like a nonexistent one (fails closed).
export async function getFlightBooking(idOrNumber, organizationId) {
  const params = organizationId ? [idOrNumber, organizationId] : [idOrNumber];
  const rows = await prisma.$queryRawUnsafe(
    `SELECT fb.*, c."fullName" AS customer_name, c.phone AS customer_phone, c.email AS customer_email, o."orderNumber" AS order_number, o."organizationId" AS organization_id
     FROM flight_bookings fb JOIN "Customer" c ON c.id=fb.customer_id JOIN "Order" o ON o.id=fb.order_id
     WHERE (fb.id=$1 OR fb.booking_number=$1)${organizationId ? ` AND o."organizationId"=$2` : ""} LIMIT 1`,
    ...params
  );
  if (!rows[0]) return null;
  return mapBookingRow(rows[0]);
}

// What a customer (phone-verified) may see: no internal storage paths or
// ids. The *_path fields become booleans so existing pages that only test
// them for truthiness keep working.
function getPublicFlightBookingView(booking) {
  if (!booking) return null;
  const { order_id, customer_id, organization_id, customer_email, ...rest } = booking;
  return {
    ...rest,
    provisional_ticket_path: Boolean(booking.provisional_ticket_path),
    payment_receipt_path: Boolean(booking.payment_receipt_path),
    final_ticket_path: Boolean(booking.final_ticket_path),
  };
}

export async function getPublicFlightBooking(idOrNumber, phone) {
  const booking = await getFlightBooking(idOrNumber);
  if (!booking || !phone || normalizePhone(phone) !== normalizePhone(booking.customer_phone)) return null;
  const accounts = ["PAYMENT_PENDING", "PAYMENT_UNDER_REVIEW", "PAYMENT_CONFIRMED"].includes(booking.status) ? await getBankAccounts() : [];
  return { ...getPublicFlightBookingView(booking), bankAccounts: accounts };
}

// Staff list. `search` matches the booking number, customer name or phone.
export async function listFlightBookings(status, organizationId, search) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`fb.status=$${params.length}`);
  }
  if (organizationId) {
    params.push(organizationId);
    conditions.push(`o."organizationId"=$${params.length}`);
  }
  const term = String(search || "").trim().slice(0, 100);
  if (term) {
    params.push(`%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    conditions.push(`(fb.booking_number ILIKE ${p} OR c."fullName" ILIKE ${p} OR c.phone ILIKE ${p} OR o."orderNumber" ILIKE ${p})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await prisma.$queryRawUnsafe(
    `SELECT fb.*, c."fullName" AS customer_name, c.phone AS customer_phone, c.email AS customer_email, o."orderNumber" AS order_number
     FROM flight_bookings fb JOIN "Customer" c ON c.id=fb.customer_id JOIN "Order" o ON o.id=fb.order_id ${where}
     ORDER BY fb.created_at DESC LIMIT 200`,
    ...params
  );
  return rows.map(mapBookingRow);
}

export async function uploadProvisionalTicket(id, file, organizationId) {
  const booking = await getFlightBooking(id, organizationId);
  if (!booking) throw notFound("Booking not found");
  if (!["REQUESTED", "RESERVATION_PENDING"].includes(booking.status)) throw badRequest("Provisional ticket can only be uploaded for a new booking");
  const saved = await saveFile(file, booking.booking_number, "provisional-ticket");
  try {
    await prisma.$transaction(async (tx) => {
      await transition(
        tx, booking.id, ["REQUESTED", "RESERVATION_PENDING"],
        `status='PAYMENT_PENDING', provisional_ticket_path=$3, provisional_ticket_name=$4, provisional_ticket_uploaded_at=CURRENT_TIMESTAMP`,
        [saved.path, saved.name]
      );
      await tx.order.update({ where: { id: booking.order_id }, data: { status: "PROCESSING" } });
    });
  } catch (error) {
    await discard(saved);
    throw error;
  }
  return getFlightBooking(booking.id);
}

export async function submitPaymentReceipt(id, file, phone) {
  const booking = await getFlightBooking(id);
  if (!booking) throw notFound("Booking not found");
  if (!phone || normalizePhone(phone) !== normalizePhone(booking.customer_phone)) throw badRequest("بيانات التحقق غير صحيحة");
  if (booking.status !== "PAYMENT_PENDING") throw badRequest("لا يمكن رفع إشعار الدفع في هذه المرحلة");
  if (!(await getBankAccounts()).length) throw badRequest("لا يوجد حساب دفع نشط حاليًا");
  const saved = await saveFile(file, booking.booking_number, "payment-receipt");
  try {
    await transition(
      prisma, booking.id, ["PAYMENT_PENDING"],
      `status='PAYMENT_UNDER_REVIEW', payment_receipt_path=$3, payment_receipt_name=$4, payment_receipt_uploaded_at=CURRENT_TIMESTAMP`,
      [saved.path, saved.name]
    );
  } catch (error) {
    await discard(saved);
    throw error;
  }
  return getPublicFlightBookingView(await getFlightBooking(booking.id));
}

// Confirms the customer's transfer: the booking moves on and the money is
// recorded in the order's payment ledger (same lock and settlement rules as
// POST /payments), exactly once even if two reviewers press confirm.
export async function confirmPayment(id, userId, note, organizationId) {
  const booking = await getFlightBooking(id, organizationId);
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "PAYMENT_UNDER_REVIEW") throw badRequest("Payment receipt must be reviewed before confirmation");

  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, booking.order_id, organizationId);
    if (!order) throw notFound("Booking not found");
    await transition(tx, booking.id, ["PAYMENT_UNDER_REVIEW"], `status='PAYMENT_CONFIRMED', payment_review_note=$3`, [note ? String(note).slice(0, 500) : null]);
    if (order.currency !== booking.currency) {
      throw httpError(409, "عملة الحجز تختلف عن عملة الطلب المرتبط.", "CURRENCY_MISMATCH");
    }
    await tx.payment.create({
      data: {
        orderId: booking.order_id,
        amount: booking.amount,
        currency: booking.currency,
        paymentMethod: "BANK_TRANSFER",
        referenceNumber: booking.booking_number,
        status: "PAID",
        reviewStatus: "CONFIRMED",
        reviewedByUserId: userId || null,
        reviewedAt: new Date(),
        createdByUserId: userId || null,
        paidAt: new Date(),
        kind: "PAYMENT",
      },
    });
    await recalculateOrderPaymentStatus(tx, booking.order_id);
    await tx.order.update({ where: { id: booking.order_id }, data: { status: "PROCESSING" } });
  });
  return getFlightBooking(booking.id);
}

export async function issueFinalTicket(id, file, organizationId) {
  const booking = await getFlightBooking(id, organizationId);
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "PAYMENT_CONFIRMED") throw badRequest("Payment must be confirmed before final ticket issuance");
  const saved = await saveFile(file, booking.booking_number, "final-ticket");
  try {
    await prisma.$transaction(async (tx) => {
      await transition(
        tx, booking.id, ["PAYMENT_CONFIRMED"],
        `status='FINAL_TICKET_ISSUED', final_ticket_path=$3, final_ticket_name=$4, final_ticket_uploaded_at=CURRENT_TIMESTAMP`,
        [saved.path, saved.name]
      );
      await tx.order.update({ where: { id: booking.order_id }, data: { status: "COMPLETED" } });
    });
  } catch (error) {
    await discard(saved);
    throw error;
  }
  return getFlightBooking(booking.id);
}

export async function getBankAccounts() {
  return prisma.$queryRawUnsafe(`SELECT id,key,label,account_number,bank_name,active FROM flight_bank_accounts WHERE active=true ORDER BY label`);
}

export async function upsertBankAccount(input) {
  if (!input.key || !input.label || !input.accountNumber) throw badRequest("key, label and accountNumber are required");
  const id = input.id || crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO flight_bank_accounts (id,key,label,account_number,bank_name,active) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label,account_number=EXCLUDED.account_number,bank_name=EXCLUDED.bank_name,active=EXCLUDED.active,updated_at=CURRENT_TIMESTAMP`,
    id, String(input.key).slice(0, 40), String(input.label).slice(0, 120), String(input.accountNumber).slice(0, 60), input.bankName ? String(input.bankName).slice(0, 120) : null, input.active !== false
  );
  return (await prisma.$queryRawUnsafe(`SELECT id,key,label,account_number,bank_name,active FROM flight_bank_accounts WHERE key=$1 LIMIT 1`, input.key))[0];
}

// `requirePhoneMatch: true` is the customer-facing path (this booking's own
// documents only, verified the same way getPublicFlightBooking/
// submitPaymentReceipt already verify ownership); staff callers (the admin
// route, already behind requireAuth+role) pass their organization instead.
export async function getBookingFile(idOrNumber, kind, { phone, requirePhoneMatch, organizationId } = {}) {
  const booking = await getFlightBooking(idOrNumber, organizationId);
  if (!booking) throw notFound("Booking not found");
  if (requirePhoneMatch) {
    if (!phone || normalizePhone(phone) !== normalizePhone(booking.customer_phone)) throw notFound("Booking not found");
  }
  const field = kind === "provisional" ? "provisional_ticket_path" : kind === "receipt" ? "payment_receipt_path" : kind === "final" ? "final_ticket_path" : null;
  if (!field || !booking[field]) throw notFound("File not available");
  // resolveStoredUploadPath maps both the new "flight-bookings/..." shape
  // and the historical "uploads/flight-bookings/..." / absolute-under-cwd
  // shape this module used to store onto the current UPLOAD_ROOT, and
  // throws on anything that would resolve outside it (traversal, an
  // unrelated absolute path).
  const absolute = resolveStoredUploadPath(booking[field]);
  return { path: absolute, name: booking[field.replace("_path", "_name")] || path.basename(absolute) };
}
