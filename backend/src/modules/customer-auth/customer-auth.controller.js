import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from "./customer-auth.validators.js";
import {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  updateCustomerProfile,
  changeCustomerPassword,
  requestPasswordReset,
  resetCustomerPassword,
} from "./customer-auth.service.js";
import { getCustomerTokenMaxAgeMs } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";

const isProduction = process.env.NODE_ENV === "production";
// Same posture as the staff/tracking auth cookies (auth.controller.js /
// contact-request-tracking.controller.js): SameSite=None+Secure in
// production for the cross-site Vercel-frontend -> Railway-backend case,
// Lax over plain HTTP in local dev.
const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
};

function sendCustomerCookie(res, token) {
  res.cookie("customerAccessToken", token, {
    ...CUSTOMER_COOKIE_OPTIONS,
    maxAge: getCustomerTokenMaxAgeMs(),
  });
}

function validationError(res, error) {
  return res.status(400).json({ success: false, message: "بيانات غير صحيحة", errors: error.flatten() });
}

export async function register(req, res, next) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await registerCustomer(parsed.data);

    if (result.error === "PHONE_TAKEN") {
      return res.status(409).json({ success: false, message: "رقم الهاتف مستخدم بالفعل، يرجى تسجيل الدخول" });
    }
    if (result.error === "EMAIL_TAKEN") {
      return res.status(409).json({ success: false, message: "البريد الإلكتروني مستخدم بالفعل" });
    }

    sendCustomerCookie(res, result.token);
    logActivity({ action: "CUSTOMER_REGISTERED", entity: "Customer", entityId: result.customer.id, req });

    return res.status(201).json({ success: true, message: "تم إنشاء الحساب بنجاح", data: { customer: result.customer } });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await loginCustomer(parsed.data);
    if (!result) {
      return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
    }

    sendCustomerCookie(res, result.token);
    logActivity({ action: "CUSTOMER_LOGIN", entity: "Customer", entityId: result.customer.id, req });

    return res.status(200).json({ success: true, message: "تم تسجيل الدخول بنجاح", data: { customer: result.customer } });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    res.clearCookie("customerAccessToken", CUSTOMER_COOKIE_OPTIONS);
    if (req.customer?.id) {
      logActivity({ action: "CUSTOMER_LOGOUT", entity: "Customer", entityId: req.customer.id, req });
    }
    return res.status(200).json({ success: true, message: "تم تسجيل الخروج" });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const customer = await getCustomerProfile(req.customer.id);
    if (!customer) return res.status(404).json({ success: false, message: "الحساب غير موجود" });
    return res.status(200).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await updateCustomerProfile(req.customer.id, parsed.data);
    if (result.error === "EMAIL_TAKEN") {
      return res.status(409).json({ success: false, message: "البريد الإلكتروني مستخدم بالفعل" });
    }

    logActivity({ action: "CUSTOMER_PROFILE_UPDATED", entity: "Customer", entityId: req.customer.id, req });
    return res.status(200).json({ success: true, message: "تم تحديث الملف الشخصي", data: result.customer });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await changeCustomerPassword(req.customer.id, parsed.data.currentPassword, parsed.data.newPassword);
    if (result.error === "INVALID_CURRENT_PASSWORD") {
      return res.status(401).json({ success: false, message: "كلمة المرور الحالية غير صحيحة" });
    }
    if (result.error === "NOT_FOUND") {
      return res.status(404).json({ success: false, message: "الحساب غير موجود" });
    }

    logActivity({ action: "CUSTOMER_PASSWORD_CHANGED", entity: "Customer", entityId: req.customer.id, req });
    return res.status(200).json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { debugCode } = await requestPasswordReset(parsed.data.phone);

    return res.status(200).json({
      success: true,
      message: "إذا كان الرقم مسجلاً لدينا فسيصلك رمز إعادة تعيين كلمة المرور عبر واتساب",
      ...(debugCode ? { debugCode } : {}),
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const result = await resetCustomerPassword(parsed.data.phone, parsed.data.code, parsed.data.newPassword);

    if (result.error === "INVALID_CODE") {
      return res.status(400).json({ success: false, message: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
    }
    if (result.error === "TOO_MANY_ATTEMPTS") {
      return res.status(429).json({ success: false, message: "تم تجاوز عدد المحاولات المسموح، يرجى طلب رمز جديد" });
    }

    logActivity({ action: "CUSTOMER_PASSWORD_RESET", entity: "Customer", req });
    return res.status(200).json({ success: true, message: "تم إعادة تعيين كلمة المرور بنجاح" });
  } catch (error) {
    next(error);
  }
}
