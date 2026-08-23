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

    const data = await updateThemeColors(parsed.data);
    logActivity({ userId: req.user?.id, action: "THEME_UPDATED", entity: "Theme", entityId: "theme", req });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
