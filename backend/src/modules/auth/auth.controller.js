import { changePasswordSchema, loginSchema } from "./auth.validators.js";
import { changeStaffPassword, getCurrentUser, loginUser, revokeStaffToken } from "./auth.service.js";
import { getAccessTokenMaxAgeMs } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";

// Production now also serves a legitimate cross-site caller (the Vercel-hosted
// marketing site's static admin pages, calling the Railway-hosted API) on top
// of the same-origin Express-served backend/public/ back-office. SameSite=Lax
// cookies aren't sent on cross-site fetch/XHR (only top-level navigation),
// which broke exactly that case — proven by reproducing it locally with two
// distinct hostnames: login succeeded (200) but the session cookie never
// reached the browser's next request. SameSite=None fixes it, but browsers
// reject a None cookie that isn't also Secure — safe to require in
// production (both origins are HTTPS there) but not in local dev over HTTP,
// where this instead falls back to the original same-site Lax behavior.
const isProduction = process.env.NODE_ENV === "production";
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
};

function sendAuthCookie(res, token) {
  res.cookie("accessToken", token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: getAccessTokenMaxAgeMs(),
  });
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await loginUser(parsed.data);

    if (!result) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (result.inactive) {
      return res.status(403).json({
        success: false,
        message: "هذا الحساب غير نشط. تواصل مع مدير النظام.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    sendAuthCookie(res, result.token);

    logActivity({
      userId: result.user.id,
      action: "LOGIN",
      entity: "User",
      entityId: result.user.id,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token: result.token,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    // Revoke first: if this fails the client is told so (5xx) instead of
    // believing a still-valid token was invalidated.
    if (req.staffSession?.tokenId && req.user?.id) {
      await revokeStaffToken({ tokenId: req.staffSession.tokenId, userId: req.user.id, exp: req.staffSession.exp });
    }
    res.clearCookie("accessToken", AUTH_COOKIE_OPTIONS);

    if (req.user?.id) {
      logActivity({
        userId: req.user.id,
        action: "LOGOUT",
        entity: "User",
        entityId: req.user.id,
        req,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const user = await getCurrentUser(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const result = await changeStaffPassword(req.user.id, parsed.data);
    if (result.error === "WRONG_PASSWORD") {
      return res.status(400).json({ success: false, message: "كلمة المرور الحالية غير صحيحة", code: "WRONG_PASSWORD" });
    }
    if (result.error) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    sendAuthCookie(res, result.token);
    logActivity({ userId: req.user.id, action: "PASSWORD_CHANGED", entity: "User", entityId: req.user.id, req });

    return res.status(200).json({ success: true, message: "تم تغيير كلمة المرور وإنهاء الجلسات الأخرى", data: { token: result.token } });
  } catch (error) {
    next(error);
  }
}
