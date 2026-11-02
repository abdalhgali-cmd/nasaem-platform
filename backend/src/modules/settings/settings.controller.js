import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { upsertSettingSchema } from "./settings.validators.js";
import { getPublicSettings as readPublicSettings, listSettings, upsertSetting } from "./settings.service.js";

export async function getPublicSettings(req, res, next) {
  try {
    const settings = await readPublicSettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function getSettings(req, res, next) {
  try {
    const settings = await listSettings();

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeSetting(req, res, next) {
  try {
    const parsed = upsertSettingSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const before = await prisma.setting.findUnique({ where: { key: parsed.data.key } });
    const setting = await upsertSetting(parsed.data);
    // Keyed by the setting's own name so secret-looking keys are redacted.
    logActivity({
      userId: req.user?.id,
      action: "SETTING_UPDATED",
      entity: "Setting",
      entityId: setting.id,
      req,
      oldValue: before ? { [setting.key]: before.value } : undefined,
      newValue: { [setting.key]: setting.value },
    });

    return res.status(200).json({
      success: true,
      message: "Setting saved successfully",
      data: setting,
    });
  } catch (error) {
    next(error);
  }
}
