import {
  createUserSchema,
  resetUserPasswordSchema,
  updateUserDepartmentSchema,
  updateUserStatusSchema,
} from "./users.validators.js";
import {
  changeUserStatus,
  createUser,
  getUserById,
  listUsers,
  resetUserPassword,
  updateUserDepartment,
} from "./users.service.js";
import { logActivity } from "../../utils/activityLog.js";

export async function getUsers(req, res, next) {
  try {
    const users = await listUsers();

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await getUserById(id);

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

export async function storeUser(req, res, next) {
  try {
    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const user = await createUser(parsed.data);

    logActivity({
      userId: req.user?.id,
      action: "USER_CREATED",
      entity: "User",
      entityId: user.id,
      req,
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = resetUserPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const user = await resetUserPassword(id, parsed.data.password);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    logActivity({
      userId: req.user?.id,
      action: "USER_PASSWORD_RESET",
      entity: "User",
      entityId: id,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateUserStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const user = await changeUserStatus(id, parsed.data.status);

    logActivity({
      userId: req.user?.id,
      action: "USER_STATUS_CHANGED",
      entity: "User",
      entityId: id,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateDepartment(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateUserDepartmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const user = await updateUserDepartment(id, parsed.data.department);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    logActivity({
      userId: req.user?.id,
      action: "USER_DEPARTMENT_CHANGED",
      entity: "User",
      entityId: id,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "User department updated successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
