import { updateThemeSchema } from "./theme.validators.js";
import { getThemeColors, updateThemeColors } from "./theme.service.js";
import { logActivity } from "../../utils/activityLog.js";

export async function getPublic(req, res, next) {
  try {
    const data = await getThemeColors();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTheme(req, res, next) {
  try {
    const data = await getThemeColors();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function patchTheme(req, res, next) {
  try {
    const parsed = updateThemeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await getThemeColors();
    const data = await updateThemeColors(parsed.data);
    // Awaited (unlike this codebase's usual fire-and-forget logActivity
    // calls) because activityLog.test.js reads the log back immediately
    // via GET /api/activity-logs right after this response — without
    // awaiting, that read could race the write and intermittently find
    // no THEME_UPDATED entry yet.
    await logActivity({ userId: req.user?.id, action: "THEME_UPDATED", entity: "Theme", entityId: "theme", req, oldValue: before, newValue: data });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
