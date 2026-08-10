import { requestCodeSchema, verifyCodeSchema } from "./customer-auth.validators.js";
import { requestLoginCode, verifyLoginCode } from "./customer-auth.service.js";
import { signAccessToken, getAccessTokenMaxAgeMs } from "../../utils/jwt.js";

// Same shape as auth.controller.js's staff cookie, distinct name and (in
// production) a topology-safe SameSite — the web app and backend are
// separate deployments and whether they end up same-site isn't knowable
// from the repo alone, so default to what works regardless.
const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production",
};

function sendCustomerAuthCookie(res, token) {
  res.cookie("customerAccessToken", token, {
    ...CUSTOMER_COOKIE_OPTIONS,
    maxAge: getAccessTokenMaxAgeMs(),
  });
}

export async function requestCode(req, res, next) {
  try {
    const parsed = requestCodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await requestLoginCode(parsed.data.phone);

    return res.status(200).json({
      success: true,
      message: "تم إرسال رمز الدخول عبر واتساب",
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

export async function verifyCode(req, res, next) {
  try {
    const parsed = verifyCodeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await verifyLoginCode(parsed.data.loginCodeId, parsed.data.code);

    if (!result) {
      return res.status(400).json({ success: false, message: "رمز غير صحيح أو منتهي الصلاحية" });
    }

    const token = signAccessToken({ phone: result.phone, type: "customer" });
    sendCustomerAuthCookie(res, token);

    return res.status(200).json({ success: true, data: { phone: result.phone } });
  } catch (error) {
    next(error);
  }
}

export function me(req, res) {
  return res.status(200).json({ success: true, data: { phone: req.customerPhone } });
}

export function logout(req, res) {
  res.clearCookie("customerAccessToken", CUSTOMER_COOKIE_OPTIONS);
  return res.status(200).json({ success: true, message: "تم تسجيل الخروج" });
}
