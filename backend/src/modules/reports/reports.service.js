import prisma from "../../config/database.js";

const CONTACT_REQUEST_STATUSES = ["NEW", "CONTACTED", "CLOSED"];
const DEPARTMENTS = ["VISAS", "FLIGHTS", "UMRAH", "HOTELS_PACKAGES", "FERRY"];

// `from`/`to` are inclusive on both ends — `to` is pushed to the end of
// that calendar day so a same-day range actually covers the whole day, not
// just its first millisecond. Anchored to ContactRequest.createdAt — the
// only timestamp this table has. NOTE: paymentStatus has no timestamp of
// its own (unlike Invoice.approvedAt), so "revenue" below really means
// "confirmed revenue on requests *created* in this window," not "money
// collected in this window" — an older request paid today still counts
// toward the window it was created in, not today. Flagged in the admin UI
// copy (see the reports tab) rather than silently misrepresented.
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
  const createdAt = parseDateRange({ from, to });
  const baseWhere = { ...(createdAt ? { createdAt } : {}), ...(department ? { department } : {}) };

  const [total, byStatusRaw, byDepartmentCountRaw, byDepartmentRevenueRaw] = await Promise.all([
    prisma.contactRequest.count({ where: baseWhere }),
    prisma.contactRequest.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.contactRequest.groupBy({ by: ["department"], where: baseWhere, _count: { _all: true } }),
    prisma.contactRequest.groupBy({
      by: ["department", "currency"],
      where: { ...baseWhere, paymentStatus: "CONFIRMED", currency: { not: null } },
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
