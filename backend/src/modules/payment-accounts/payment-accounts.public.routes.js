import { Router } from "express";
import { requireTrackingAuth } from "../contact-request-tracking/tracking-auth.middleware.js";
import { listPaymentAccountsForPhone } from "../contact-request-tracking/contact-request-tracking.service.js";

const router = Router();

router.get("/active", requireTrackingAuth, async (req, res, next) => {
  try {
    // Only the accounts of a request whose price this phone has approved.
    const currency = req.query.currency?.trim() || undefined;
    const data = await listPaymentAccountsForPhone(req.trackingPhone, currency);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
