import prisma from "../../config/database.js";
import { verifyCustomerToken } from "../../utils/jwt.js";

// The Capacitor Android app cannot rely on a cross-origin cookie surviving
// an app restart as reliably as a browser does, so it stores the same
// customer token itself and sends it as a Bearer header; the cookie stays
// the primary mechanism for the web account pages. Either credential maps
// to the exact same scoped, 30-day customer token — there is no separate
// trust path to reason about.
function extractCustomerToken(req) {
  if (req.cookies?.customerAccessToken) return req.cookies.customerAccessToken;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

// Mirrors requireAuth (staff) / requireTrackingAuth (phone tracking): its
// own cookie, its own token scope, and — critically — it always re-fetches
// the Customer row rather than trusting the JWT payload alone, so a
// password change or an account that gets deleted takes effect immediately
// instead of only once the token expires.
export async function attachOptionalCustomer(req, res, next) {
  try {
    const token = extractCustomerToken(req);
    if (!token) return next();
    const payload = verifyCustomerToken(token);
    const customer = await prisma.customer.findUnique({
      where: { id: payload.sub },
      select: { id: true, organizationId: true, passwordHash: true, organization: { select: { active: true } } },
    });
    if (customer?.passwordHash && customer.organization.active) {
      req.customer = { id: customer.id, organizationId: customer.organizationId };
      req.organizationId = customer.organizationId;
    }
  } catch {
    // Anonymous public submissions remain valid when an optional cookie is invalid.
  }
  return next();
}

export async function requireCustomerAuth(req, res, next) {
  try {
    const token = extractCustomerToken(req);

    if (!token) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const payload = verifyCustomerToken(token);
    const customerId = payload.sub;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        customerNo: true,
        fullName: true,
        phone: true,
        email: true,
        passportNo: true,
        nationality: true,
        country: true,
        city: true,
        address: true,
        passwordHash: true,
        createdAt: true,
        organizationId: true,
        organization: { select: { active: true } },
      },
    });

    // passwordHash === null means this Customer row was never turned into
    // an account (or had its account removed) — the session must not
    // survive that, even though the token itself is still validly signed.
    if (!customer || !customer.passwordHash || !customer.organization.active) {
      return res.status(401).json({ success: false, message: "الجلسة غير صالحة" });
    }

    const { passwordHash, organization, ...safeCustomer } = customer;
    req.customer = safeCustomer;
    req.organizationId = customer.organizationId;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "الجلسة منتهية، يرجى تسجيل الدخول مجددًا" });
  }
}
