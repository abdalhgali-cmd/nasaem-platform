import { createUserSchema, updateUserRoleSchema, updateUserStatusSchema } from "./users.validators.js";
import { changeUserRole, changeUserStatus, createUser, getUserById, listUsers } from "./users.service.js";
import { logActivity } from "../../utils/activityLog.js";

export async function getUsers(req, res, next) {
  try {
    const users = await listUsers(req.user.organizationId);

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
    const user = await getUserById(id, req.user.organizationId);

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

    const user = await createUser(parsed.data, req.user.organizationId);

    logActivity({
      userId: req.user?.id,
      action: "USER_CREATED",
      entity: "User",
      entityId: user.id,
      newValue: { role: user.role, status: user.status, branchId: user.branchId },
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

export async function updateRole(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateUserRoleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const result = await changeUserRole({ id, role: parsed.data.role, actor: req.user });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    logActivity({
      userId: req.user?.id,
      action: "USER_ROLE_CHANGED",
      entity: "User",
      entityId: id,
      oldValue: result.before,
      newValue: result.after,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      data: result.user,
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

    const result = await changeUserStatus({ id, status: parsed.data.status, actor: req.user });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    logActivity({
      userId: req.user?.id,
      action: "USER_STATUS_CHANGED",
      entity: "User",
      entityId: id,
      oldValue: result.before,
      newValue: result.after,
      req,
    });

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: result.user,
    });
  } catch (error) {
    next(error);
  }
}
