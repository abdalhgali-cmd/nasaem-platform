import { extractPassportData } from "./passport-ocr.service.js";

export async function scanPassport(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded",
      });
    }

    const data = await extractPassportData(req.file.buffer);

    if (!data) {
      return res.status(422).json({
        success: false,
        message:
          "Could not read a valid passport MRZ from this image. Try a clearer, well-lit, straight-on photo of the passport's data page.",
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
