import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";

function pricingDescription(data, price) {
  const base = data.description ? `${data.description}\n` : "";
  return `${base}التسعير: ${price.sourceAmount} ${data.sourceCurrency} × ${price.exchangeRate} + هامش ${price.marginPercent}% = ${price.customerPrice} SDG`;
}

export async function createCalculatedInvoice(contactRequestId, data, price, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true, offers: true },
  });

  if (!contactRequest) return { error: "NOT_FOUND" };
  if (contactRequest.invoice?.status === "APPROVED") return { error: "ALREADY_APPROVED" };
  if (contactRequest.offers.length > 0) return { error: "OFFERS_EXIST" };

  const invoice = await prisma.invoice.upsert({
    where: { contactRequestId },
    create: {
      contactRequestId,
      amount: price.customerPrice,
      currency: "SDG",
      description: pricingDescription(data, price),
      createdByUserId: userId,
    },
    update: {
      amount: price.customerPrice,
      currency: "SDG",
      description: pricingDescription(data, price),
      status: "PENDING",
      decidedAt: null,
      createdByUserId: userId,
    },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_PRICED_INVOICE_SET",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تم تجهيز سعر طلبك: ${price.customerPrice.toLocaleString()} SDG\nيمكنك مراجعة السعر والموافقة عليه عبر صفحة متابعة الطلب.`
  );

  return { invoice, created: invoice.createdAt.getTime() === invoice.updatedAt.getTime() };
}

export async function createCalculatedOffer(contactRequestId, data, price, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true },
  });

  if (!contactRequest) return { error: "NOT_FOUND" };
  if (contactRequest.invoice) return { error: "INVOICE_EXISTS" };
  if (contactRequest.selectedOfferId) return { error: "ALREADY_SELECTED" };

  const offer = await prisma.contactRequestOffer.create({
    data: {
      contactRequestId,
      carrier: data.carrier,
      description: pricingDescription(data, price),
      amount: price.customerPrice,
      currency: "SDG",
      createdByUserId: userId,
    },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_PRICED_OFFER_ADDED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تمت إضافة عرض ${data.carrier} لطلبك بقيمة ${price.customerPrice.toLocaleString()} SDG.`
  );

  return { offer };
}
