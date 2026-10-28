import { Router } from "express";
import rateLimit from "express-rate-limit";

import prisma from "../../config/database.js";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { redactSensitive } from "../../utils/activityLog.js";
import { pricingConfigError } from "../contact-request-pricing/fixed-price.js";
import { requireStagingProof, requireStagingServer, signStagingAnswer } from "./staging-guard.js";

// Operator actions that exist only on staging (see staging-guard.js). On any
// server that cannot prove it is staging every route here answers 404.
const router = Router();

// The owner-approved Umrah prices (decision 2026-10-28). Held by the server,
// not sent by the client: the script can only ask staging to apply exactly
// these.
export const APPROVED_UMRAH_PRICES = Object.freeze([
  { code: "SVC-UMRAH-VISA", basePrice: 795 },
  { code: "SVC-UMRAH-AIR", basePrice: 3500 },
  { code: "SVC-UMRAH-SEA", basePrice: 2650 },
]);
const TARGET = Object.freeze({ pricingMode: "FIXED", currency: "SAR", priceUnit: "PER_TRAVELER", active: true });
const FIELDS = ["pricingMode", "basePrice", "currency", "priceUnit", "active"];

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please try again later." } });

const view = (row) => (row ? Object.fromEntries(FIELDS.map((f) => [f, f === "basePrice" ? Number(row[f]) : row[f]])) : null);
const isApproved = (row, approved) => row && row.pricingMode === TARGET.pricingMode && Number(row.basePrice) === approved.basePrice && row.currency === TARGET.currency && row.priceUnit === TARGET.priceUnit && row.active === true;

// Guard order: the staging proof first, so a non-staging server answers 404
// before anything else (no hint that the route exists), then the session.
router.use(requireStagingServer, limiter, requireStagingProof, requireAuth, requireRole("SUPER_ADMIN", "ADMIN"));

// Signed statement "this server is staging", bound to the caller's nonce.
router.post("/attest", (req, res) => res.status(200).json({ success: true, data: signStagingAnswer(req) }));

// Applies the approved Umrah prices in one transaction: all three or none.
// Touches only pricing mode, price, currency, unit and published state of
// these three services; never their descriptions, other services, requests
// or customers. Already-approved rows are left as they are.
router.post("/umrah-pricing", async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const codes = APPROVED_UMRAH_PRICES.map((a) => a.code);
      const locked = await tx.$queryRaw`SELECT id FROM "Service" WHERE code = ANY(${codes}) FOR UPDATE`;
      const rows = await tx.service.findMany({ where: { id: { in: locked.map((r) => r.id) } } });
      const missing = codes.filter((code) => !rows.some((r) => r.code === code));
      if (missing.length) return { error: "MISSING", missing };
      const changes = [];
      for (const approved of APPROVED_UMRAH_PRICES) {
        const row = rows.find((r) => r.code === approved.code);
        if (isApproved(row, approved)) {
          changes.push({ code: approved.code, before: view(row), after: view(row), changed: false });
          continue;
        }
        const data = { ...TARGET, basePrice: approved.basePrice };
        const invalid = pricingConfigError({ ...row, ...data });
        if (invalid) throw new Error(invalid);
        const updated = await tx.service.update({ where: { id: row.id }, data });
        // Audited in the same transaction: no price change without its record.
        await tx.activityLog.create({
          data: {
            userId: req.user.id,
            action: "UMRAH_PRICING_ACTIVATED",
            entity: "Service",
            entityId: row.id,
            ipAddress: req.ip || null,
            userAgent: req.headers["user-agent"] || null,
            oldValue: redactSensitive(view(row)),
            newValue: redactSensitive(view(updated)),
            ...(req.user.organizationId ? { organizationId: req.user.organizationId } : {}),
          },
        });
        changes.push({ code: approved.code, before: view(row), after: view(updated), changed: true });
      }
      return { changes };
    });
    if (result.error === "MISSING") return res.status(409).json({ success: false, code: "UMRAH_PACKAGES_MISSING", missing: result.missing });
    return res.status(200).json({ success: true, data: { attestation: signStagingAnswer(req), changes: result.changes } });
  } catch (error) {
    next(error);
  }
});

export default router;
