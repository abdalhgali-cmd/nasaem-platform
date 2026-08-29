import { getFinancialReport } from "./finance.service.js";

const VALID_PERIODS = new Set(["day", "week", "month"]);
const VALID_GROUPS = new Set(["service", "employee", "supplier", "currency"]);

export async function getReport(req, res, next) {
  try {
    const { period, from, to, groupBy } = req.query;

    if (period && !VALID_PERIODS.has(period)) {
      return res.status(400).json({ success: false, message: "period must be one of: day, week, month" });
    }
    if (groupBy && !VALID_GROUPS.has(groupBy)) {
      return res.status(400).json({ success: false, message: "groupBy must be one of: service, employee, supplier, currency" });
    }

    const data = await getFinancialReport({ period, from, to, groupBy, organizationId: req.user.organizationId });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
