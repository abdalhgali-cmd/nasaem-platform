import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";

// The `message` column is required (NOT NULL) since it predates structured
// `details` and every dashboard view/notification still reads it. A
// service-form submission may have no free-text notes at all, so fall back
// to a readable summary built from its structured fields instead of "".
function composeMessage(message, details) {
  const trimmed = message?.trim();
  if (trimmed) return trimmed;

  if (details && Object.keys(details).length > 0) {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join("، ");
  }

  return "-";
}

export async function createContactRequest(data, req) {
  const message = composeMessage(data.message, data.details);

  const contactRequest = await prisma.contactRequest.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      service: data.service || null,
      message,
      details: data.details && Object.keys(data.details).length > 0 ? data.details : undefined,
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
