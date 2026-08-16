import { confirmStaffPasswordResetSchema, loginSchema, requestStaffPasswordResetSchema } from "./auth.validators.js";
import { getCurrentUser, loginUser, requestStaffPasswordReset, resetStaffPasswordWithCode } from "./auth.service.js";
import { getAccessTokenMaxAgeMs } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
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

    if (result === "inactive") {
      return res.status(401).json({
        success: false,
        message: "Account is not active",
      });
    }

    if (!result) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
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

export async function requestPasswordReset(req, res, next) {
  try {
    const parsed = requestStaffPasswordResetSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await requestStaffPasswordReset(parsed.data.email);

    return res.status(200).json({
      success: true,
      message: "إذا كان البريد مسجّلًا لدى موظف لديه رقم هاتف، سيصلك رمز عبر واتساب",
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

export async function confirmPasswordReset(req, res, next) {
  try {
    const parsed = confirmStaffPasswordResetSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await resetStaffPasswordWithCode(
      parsed.data.resetCodeId,
      parsed.data.code,
      parsed.data.password,
      req
    );

    if (!result) {
      return res.status(400).json({ success: false, message: "الرمز غير صحيح أو منتهي الصلاحية" });
    }

    return res.status(200).json({
      success: true,
      message: "تم تحديث كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن",
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
