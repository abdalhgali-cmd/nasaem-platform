import prisma from "../../config/database.js";

const CONTACT_REQUEST_STATUSES = ["NEW", "CONTACTED", "CLOSED"];
const DEPARTMENTS = ["VISAS", "FLIGHTS", "UMRAH", "HOTELS_PACKAGES", "FERRY"];

// `from`/`to` are inclusive on both ends — `to` is pushed to the end of
// that calendar day so a same-day range actually covers the whole day, not
// just its first millisecond. Used against two different date axes below:
// ContactRequest.createdAt for total/byStatus/byDepartment counts, and
// ContactRequest.paymentConfirmedAt for revenue specifically — see
// getReportsSummary's revenueWhere.
function parseDateRange({ from, to }) {
  const range = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) range.gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) {
      // `parsed` was parsed as UTC midnight (ISO date-only parsing) — set
      // the end-of-day boundary in UTC too, so it doesn't drift with the
      // server process's local time zone.
      parsed.setUTCHours(23, 59, 59, 999);
      range.lte = parsed;
    }
  }
  return Object.keys(range).length > 0 ? range : undefined;
}

export async function getReportsSummary({ from, to, department }) {
  const range = parseDateRange({ from, to });
  const baseWhere = { ...(range ? { createdAt: range } : {}), ...(department ? { department } : {}) };
  // Revenue answers a different question from the three counts above:
  // "money confirmed collected in this window," not "requests opened in
  // this window." When no range is given, paymentConfirmedAt is left
  // unfiltered so legacy rows with a NULL timestamp still count toward
  // all-time revenue. A REFUNDED request is excluded here (paymentStatus
  // is no longer CONFIRMED) while still counting toward `total` above.
  const revenueWhere = {
    ...(range ? { paymentConfirmedAt: range } : {}),
    ...(department ? { department } : {}),
    paymentStatus: "CONFIRMED",
    currency: { not: null },
  };

  const [total, byStatusRaw, byDepartmentCountRaw, byDepartmentRevenueRaw] = await Promise.all([
    prisma.contactRequest.count({ where: baseWhere }),
    prisma.contactRequest.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.contactRequest.groupBy({ by: ["department"], where: baseWhere, _count: { _all: true } }),
    prisma.contactRequest.groupBy({
      by: ["department", "currency"],
      where: revenueWhere,
      _sum: { paymentAmount: true },
    }),
  ]);

  const byStatus = Object.fromEntries(CONTACT_REQUEST_STATUSES.map((s) => [s, 0]));
  byStatusRaw.forEach((row) => {
    byStatus[row.status] = row._count._all;
  });

  const byDepartment = Object.fromEntries([...DEPARTMENTS, "UNASSIGNED"].map((d) => [d, { count: 0, revenue: {} }]));
  byDepartmentCountRaw.forEach((row) => {
    byDepartment[row.department ?? "UNASSIGNED"].count = row._count._all;
  });
  byDepartmentRevenueRaw.forEach((row) => {
    byDepartment[row.department ?? "UNASSIGNED"].revenue[row.currency] = Number(row._sum.paymentAmount || 0);
  });

  const revenueByCurrency = {};
  Object.values(byDepartment).forEach(({ revenue }) => {
    Object.entries(revenue).forEach(([currency, amount]) => {
      revenueByCurrency[currency] = (revenueByCurrency[currency] || 0) + amount;
    });
  });

  return { total, byStatus, revenueByCurrency, byDepartment };
}
