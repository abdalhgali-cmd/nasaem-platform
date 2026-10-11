import { createPaymentAccountSchema, updatePaymentAccountSchema } from "./payment-accounts.validators.js";
import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { createPaymentAccount, listActivePaymentAccounts, listPaymentAccounts, updatePaymentAccount } from "./payment-accounts.service.js";

export async function getActivePaymentAccounts(req, res, next) {
  try {
    const data = await listActivePaymentAccounts(req.query.currency?.trim() || undefined);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getPaymentAccounts(req, res, next) {
  try {
    const data = await listPaymentAccounts();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function postPaymentAccount(req, res, next) {
  try {
    const parsed = createPaymentAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }
    const data = await createPaymentAccount({ ...parsed.data, accountNumber: parsed.data.accountNumber || null, iban: parsed.data.iban || null });
    logActivity({ userId: req.user?.id, action: "PAYMENT_ACCOUNT_CREATED", entity: "PaymentAccount", entityId: data.id, req, newValue: { name: data.name, bankName: data.bankName, currency: data.currency, active: data.active } });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function patchPaymentAccount(req, res, next) {
  try {
    const parsed = updatePaymentAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }
    const before = await prisma.paymentAccount.findUnique({ where: { id: req.params.id } });
    const data = await updatePaymentAccount(req.params.id, {
      ...parsed.data,
      ...(parsed.data.accountNumber !== undefined ? { accountNumber: parsed.data.accountNumber || null } : {}),
      ...(parsed.data.iban !== undefined ? { iban: parsed.data.iban || null } : {}),
    });
    // Account numbers are redacted in the log (utils/activityLog.js), so record
    // WHETHER the bank details changed: swapping the account a customer pays
    // into is the change an audit must always be able to see.
    const detailsChanged = Boolean(before) && (before.accountNumber !== data.accountNumber || before.iban !== data.iban || before.accountName !== data.accountName || before.bankName !== data.bankName);
    logActivity({
      userId: req.user?.id,
      action: "PAYMENT_ACCOUNT_UPDATED",
      entity: "PaymentAccount",
      entityId: data.id,
      req,
      oldValue: before ? { name: before.name, currency: before.currency, active: before.active } : undefined,
      newValue: { name: data.name, currency: data.currency, active: data.active, bankDetailsChanged: detailsChanged },
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
