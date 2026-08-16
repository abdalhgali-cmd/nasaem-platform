import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";

export async function createContactRequest(data, req) {
  const contactRequest = await prisma.contactRequest.create({
    data: {
      name: data.name,
      phone: data.phone,
      phoneNormalized: normalizePhone(data.phone),
      email: data.email || null,
      service: data.service || null,
      message: data.message,
    },
  });

  logActivity({
    action: "CONTACT_REQUEST_RECEIVED",
    entity: "ContactRequest",
    entityId: contactRequest.id,
    req,
  });

  // Fan out an internal notification to every admin so a new inquiry from
  // the public site is actually seen, not just silently stored.
  const admins = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        title: "طلب تواصل جديد من الموقع",
        message: `${contactRequest.name} (${contactRequest.phone}) — ${contactRequest.message.slice(0, 120)}`,
        type: "CONTACT_REQUEST",
        userId: admin.id,
      })
    )
  );

  // Not awaited: a slow/unreachable WhatsApp API must not delay the
  // response to whoever submitted the contact form. No-ops entirely when
  // WHATSAPP_* env vars aren't set (see utils/whatsapp.js).
  sendWhatsAppMessage(
    process.env.WHATSAPP_ADMIN_NUMBER,
    `طلب تواصل جديد من الموقع\nالاسم: ${contactRequest.name}\nالهاتف: ${contactRequest.phone}\nالرسالة: ${contactRequest.message.slice(0, 200)}`
  );

  return contactRequest;
}

export async function listContactRequests({ page, limit, skip, status }) {
  const where = status ? { status } : undefined;

  const [data, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { invoice: true },
    }),
    prisma.contactRequest.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function updateContactRequestStatus(id, status) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.contactRequest.update({
    where: { id },
    data: { status },
  });
}

// Creates the first quote for a ContactRequest, or reissues one after the
// customer rejected the previous quote. Once a customer has approved a
// quote the price is locked — callers must check for the "ALREADY_APPROVED"
// error and refuse the request rather than silently overwriting an amount
// the customer already agreed to pay.
export async function createOrUpdateInvoice(contactRequestId, data, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice?.status === "APPROVED") {
    return { error: "ALREADY_APPROVED" };
  }

  const invoice = await prisma.invoice.upsert({
    where: { contactRequestId },
    create: {
      contactRequestId,
      amount: data.amount,
      currency: data.currency,
      description: data.description || null,
      createdByUserId: userId,
    },
    update: {
      amount: data.amount,
      currency: data.currency,
      description: data.description || null,
      status: "PENDING",
      decidedAt: null,
      createdByUserId: userId,
    },
  });

  // Not awaited: same rationale as createContactRequest — a slow/unreachable
  // WhatsApp API must never delay the response, and this silently no-ops
  // when WHATSAPP_* env vars aren't set (dev/test).
  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تم تحديد سعر لطلبك: ${data.amount} ${data.currency}\nيمكنك مراجعته والموافقة عليه عبر صفحة تتبع الطلب.`
  );

  return { invoice };
}

// Only moves AWAITING payment confirmation forward from UNDER_REVIEW — a
// customer must have first approved the quote (Invoice.status APPROVED,
// which sets paymentStatus AWAITING_TRANSFER) and then declared the
// transfer sent (paymentStatus UNDER_REVIEW) before staff can confirm it.
export async function confirmContactRequestPayment(contactRequestId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.paymentStatus !== "UNDER_REVIEW") {
    return { error: "INVALID_STATE" };
  }

  const updated = await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date() },
  });

  return { contactRequest: updated };
}
