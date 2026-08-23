import { comparePassportDataToCustomer, extractPassportData } from "./passport-ocr.service.js";
import prisma from "../../config/database.js";

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

    // Optional: compare against an existing customer's record (e.g. staff
    // re-scanning a passport already on file) so a mismatched document is
    // visible immediately rather than silently overwriting good data.
    let comparison = null;
    if (req.body?.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: req.body.customerId } });
      if (!customer) {
        return res.status(404).json({ success: false, message: "Customer not found" });
      }
      comparison = comparePassportDataToCustomer(data, customer);
    }

    return res.status(200).json({ success: true, data, comparison });
  } catch (error) {
    next(error);
  }
}
