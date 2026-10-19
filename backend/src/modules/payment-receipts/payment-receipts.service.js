// Paid receipts («إيصال سداد»). The receipt row and its e-mail outbox row
// are written inside the same locked transaction that confirms the payment
// (contact-requests.service.js confirmContactRequestPayment): a confirmed
// payment always has exactly one receipt, and a repeated or concurrent
// confirmation can never create a second one (unique contactRequestId and
// receiptNo). The PDF and the e-mail happen after commit and are retried by
// the reconciler; neither can undo or block the payment confirmation.
import fs from "fs";
import path from "path";
import prisma from "../../config/database.js";
import { resolveStoredUploadPath, resolveUploadPath } from "../../config/uploadRoot.js";
import { isValidRecipient } from "../../utils/providerEmail.js";
import { renderReceiptPdf } from "./receipt-pdf.js";

export const PAYMENT_RECEIPT = "PAYMENT_RECEIPT";
export const EMAIL = "EMAIL";
const RECEIPT_DIR = "payment-receipts";
// A PDF claimed for this long without finishing was abandoned (crash).
const STALE_GENERATING_MS = 2 * 60 * 1000;

function serviceName(request) {
  return request.serviceRef?.name || request.visaType?.name || request.service || "خدمة سفر";
}

// What was actually accepted: the approved invoice, or the offer the
// customer chose. Nothing else is a confirmed amount; without one no
// receipt is issued (an amount is never invented).
export function confirmedAmount(request) {
  if (request.invoice) {
    const { amount, currency, exchangeRateToSdg, amountSdg, rateFixedAt } = request.invoice;
    return { amount, currency, exchangeRateToSdg, amountSdg, rateFixedAt };
  }
  const offer = (request.offers || []).find((candidate) => candidate.id === request.selectedOfferId);
  if (offer) return { amount: offer.amount, currency: offer.currency, exchangeRateToSdg: offer.exchangeRateToSdg ?? null, amountSdg: offer.amountSdg ?? null, rateFixedAt: offer.rateFixedAt ?? null };
  return null;
}

async function nextReceiptNo(tx, paidAt) {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Khartoum", year: "numeric" }).format(paidAt);
  const counter = await tx.counter.upsert({
    where: { key: `PAYMENT_RECEIPT_${year}` },
    create: { key: `PAYMENT_RECEIPT_${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `NR-${year}-${String(counter.value).padStart(6, "0")}`;
}

// Inside the payment-confirmation transaction (request row locked).
export async function createReceiptInTransaction(tx, request, { userId, paidAt }) {
  const existing = await tx.paymentReceipt.findUnique({ where: { contactRequestId: request.id }, select: { id: true } });
  if (existing) return existing;
  const amount = confirmedAmount(request);
  if (!amount) return null;
  const email = isValidRecipient(request.email) ? request.email.trim() : null;
  const receipt = await tx.paymentReceipt.create({
    data: {
      contactRequestId: request.id,
      receiptNo: await nextReceiptNo(tx, paidAt),
      amount: amount.amount,
      currency: amount.currency,
      exchangeRateToSdg: amount.exchangeRateToSdg,
      amountSdg: amount.amountSdg,
      rateFixedAt: amount.rateFixedAt,
      customerName: request.name,
      customerEmail: email,
      serviceName: serviceName(request),
      travelerCount: Math.max(1, request.travelers?.length || request.travelerCount || 1),
      paidAt,
      confirmedByUserId: userId || null,
    },
  });
  await tx.customerMessageDelivery.createMany({
    data: [{ contactRequestId: request.id, kind: PAYMENT_RECEIPT, channel: EMAIL, recipient: email || "" }],
    skipDuplicates: true,
  });
  return receipt;
}

async function agencyProfile() {
  const profile = await prisma.companyProfile.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null);
  return { name: profile?.name || "نسائم الحرمين", phone: profile?.phone || null, email: profile?.email || null, address: profile?.address || null };
}

// Produces the PDF once (PENDING -> GENERATING -> READY | FAILED after 5
// attempts). The file is written and checked on disk before the row says
// READY; a crash in between leaves GENERATING, re-claimed after a while.
export async function generateReceiptPdf(contactRequestId) {
  const now = new Date();
  const claimed = await prisma.paymentReceipt.updateMany({
    where: {
      contactRequestId,
      OR: [{ pdfStatus: "PENDING" }, { pdfStatus: "GENERATING", updatedAt: { lt: new Date(now.getTime() - STALE_GENERATING_MS) } }],
    },
    data: { pdfStatus: "GENERATING", pdfAttempts: { increment: 1 } },
  });
  const receipt = await prisma.paymentReceipt.findUnique({ where: { contactRequestId } });
  if (!receipt || claimed.count !== 1) return receipt;
  try {
    const buffer = await renderReceiptPdf(receipt, await agencyProfile());
    const fileName = `${receipt.receiptNo}-${receipt.id}.pdf`;
    const directory = resolveUploadPath(RECEIPT_DIR);
    fs.mkdirSync(directory, { recursive: true });
    const absolute = path.join(directory, fileName);
    fs.writeFileSync(absolute, buffer);
    if (fs.statSync(absolute).size !== buffer.length) throw new Error("STORED_SIZE_MISMATCH");
    return await prisma.paymentReceipt.update({
      where: { id: receipt.id },
      data: { pdfStatus: "READY", storagePath: path.posix.join(RECEIPT_DIR, fileName), sizeBytes: buffer.length, lastError: null },
    });
  } catch (error) {
    const failed = receipt.pdfAttempts >= 5;
    return prisma.paymentReceipt.update({ where: { id: receipt.id }, data: { pdfStatus: failed ? "FAILED" : "PENDING", lastError: String(error?.message || error).slice(0, 300) } });
  }
}

export async function getReceiptFile(contactRequestId) {
  const receipt = await prisma.paymentReceipt.findUnique({ where: { contactRequestId } });
  if (!receipt || receipt.pdfStatus !== "READY" || !receipt.storagePath) return null;
  const absolutePath = resolveStoredUploadPath(receipt.storagePath);
  if (!fs.existsSync(absolutePath)) return null;
  return { absolutePath, fileName: `${receipt.receiptNo}.pdf`, mimeType: "application/pdf", receipt };
}

export async function getReceiptSummary(contactRequestId) {
  return prisma.paymentReceipt.findUnique({
    where: { contactRequestId },
    select: { receiptNo: true, pdfStatus: true, amount: true, currency: true, paidAt: true, customerEmail: true },
  });
}
