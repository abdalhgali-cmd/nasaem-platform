import { reportsSummaryQuerySchema } from "./reports.validators.js";
import { getReportsSummary } from "./reports.service.js";

export async function getReportsSummaryHandler(req, res, next) {
  try {
    const parsed = reportsSummaryQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const data = await getReportsSummary(parsed.data);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}
