import { changePasswordSchema, loginSchema } from "./auth.validators.js";
import { changePassword, getCurrentUser, loginUser } from "./auth.service.js";
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

export async function changeMyPassword(req, res, next) {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await changePassword(req.user.id, parsed.data);

    if (result === "invalid_current") {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    if (result === "not_found") {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    logActivity({
      userId: req.user.id,
      action: "CHANGE_PASSWORD",
      entity: "User",
      entityId: req.user.id,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
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
