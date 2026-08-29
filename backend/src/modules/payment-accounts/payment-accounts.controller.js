import { createPaymentAccountSchema, updatePaymentAccountSchema } from "./payment-accounts.validators.js";
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
    const data = await updatePaymentAccount(req.params.id, {
      ...parsed.data,
      ...(parsed.data.accountNumber !== undefined ? { accountNumber: parsed.data.accountNumber || null } : {}),
      ...(parsed.data.iban !== undefined ? { iban: parsed.data.iban || null } : {}),
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
