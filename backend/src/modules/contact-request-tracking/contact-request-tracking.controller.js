import {
  requestCodeSchema,
  verifyCodeSchema,
} from "./contact-request-tracking.validators.js";
import {
  requestLoginCode,
  verifyLoginCode,
  listContactRequestsForPhone,
} from "./contact-request-tracking.service.js";
import { getTrackingTokenMaxAgeMs } from "../../utils/jwt.js";

const TRACKING_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
};

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

    const { debugCode } = await requestLoginCode(parsed.data.phone);

    return res.status(200).json({
      success: true,
      message: "إذا كان الرقم مسجلاً، سيصلك رمز التحقق عبر واتساب",
      ...(debugCode ? { debugCode } : {}),
    });
  } catch (error) {
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

    const result = await verifyLoginCode(parsed.data.phone, parsed.data.code);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.cookie("trackingAccessToken", result.token, {
      ...TRACKING_COOKIE_OPTIONS,
      maxAge: getTrackingTokenMaxAgeMs(),
    });

    return res.status(200).json({
      success: true,
      message: "تم تسجيل الدخول بنجاح",
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyRequests(req, res, next) {
  try {
    const requests = await listContactRequestsForPhone(req.trackingPhone);

    return res.status(200).json({
      success: true,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    res.clearCookie("trackingAccessToken", TRACKING_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "تم تسجيل الخروج",
    });
  } catch (error) {
    next(error);
  }
}
