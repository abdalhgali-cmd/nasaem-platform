import { Router } from "express";
import { requireTrackingAuth } from "../contact-request-tracking/tracking-auth.middleware.js";
import { listActivePaymentAccounts } from "./payment-accounts.service.js";

const router = Router();

router.get("/active", requireTrackingAuth, async (req, res, next) => {
  try {
    const currency = req.query.currency?.trim() || undefined;
    const data = await listActivePaymentAccounts(currency);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
