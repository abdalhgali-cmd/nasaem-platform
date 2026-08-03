import { upsertSettingSchema } from "./settings.validators.js";
import { listSettings, upsertSetting } from "./settings.service.js";

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

    const setting = await upsertSetting(parsed.data);

    return res.status(200).json({
      success: true,
      message: "Setting saved successfully",
      data: setting,
    });
  } catch (error) {
    next(error);
  }
}
