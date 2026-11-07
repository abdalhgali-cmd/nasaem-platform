import { test, expect } from "@playwright/test";
import {
  egyptSignal, itemSignal, ownerOf, umrahSignal, workload,
  type EgyptRow, type OperationItem, type ServiceIndex, type UmrahRow,
} from "../src/components/admin/operations/ops-model";

// Pure rules of the Operations Center (no browser). The approved colour rule
// R2: red only for a genuinely missed deadline; 24 hours without activity is
// amber, never a missed deadline.

const egypt = (overrides: Partial<EgyptRow> = {}): EgyptRow => ({
  id: "eg1", name: "عميل", phone: "+249900000000", entryMode: "AIR", entryPoint: null, priority: "NORMAL", dueAt: null, pastDue: false,
  status: "NEW", paymentStatus: "CONFIRMED", stage: "APPROVAL_IN_PROGRESS", stageLabel: "جاري إصدار الموافقة", approvalIssued: false,
  circularStatus: "NOT_STARTED", travelDate: "2030-01-10", daysUntil: 20, imminent: false, overdue: false, missingDate: false,
  documentIssues: [], assignedUser: null, nextAction: "إصدار الموافقة ورفع صورتها", ...overrides,
});
const umrah = (overrides: Partial<UmrahRow> = {}): UmrahRow => ({
  id: "um1", name: "معتمر", status: "NEW", paymentStatus: "UNDER_REVIEW", updatedAt: "2030-01-01T00:00:00Z", assignedUser: null,
  readiness: { sla: null }, umrahQueue: { nextAction: "مراجعة إيصال الدفع وتأكيده", rank: 0, preferredTravelDate: null }, ...overrides,
});
const item = (overrides: Partial<OperationItem> = {}): OperationItem => ({
  source: "contact_request", id: "x1", reference: "x1", customerName: "عميل", phone: "", service: "استفسار", status: "NEW",
  paymentStatus: "NOT_REQUIRED", amount: null, currency: null, updatedAt: "2030-01-01T00:00:00Z", ageHours: 1,
  nextAction: { key: "PROCESS", label: "معالجة الطلب" }, ...overrides,
});
const indexOf = (eg: EgyptRow[] = [], um: UmrahRow[] = []): ServiceIndex => ({ egypt: new Map(eg.map((r) => [r.id, r])), umrah: new Map(um.map((r) => [r.id, r])) });

test.describe("Operations Center rules (R2)", () => {
  test("Egypt: a passed internal deadline or a passed travel date on an open request is red", () => {
    expect(egyptSignal(egypt({ pastDue: true, dueAt: "2030-01-01T00:00:00Z" }))?.level).toBe("late");
    expect(egyptSignal(egypt({ overdue: true, daysUntil: -1, travelDate: "2030-01-01" }))?.level).toBe("late");
  });

  test("Egypt: travel within the alert window is amber; otherwise no signal", () => {
    const soon = egyptSignal(egypt({ imminent: true, daysUntil: 2 }));
    expect(soon?.level).toBe("warn");
    expect(soon?.label).toBe("السفر خلال 2 يوم");
    expect(egyptSignal(egypt({ imminent: true, daysUntil: 0 }))?.label).toBe("السفر اليوم");
    expect(egyptSignal(egypt())).toBeNull();
  });

  test("Umrah: SLA OVERDUE is red, DUE_TODAY amber", () => {
    expect(umrahSignal(umrah({ readiness: { sla: "OVERDUE" } }))?.level).toBe("late");
    expect(umrahSignal(umrah({ readiness: { sla: "DUE_TODAY" } }))?.level).toBe("warn");
    expect(umrahSignal(umrah())).toBeNull();
  });

  test("24 hours without activity is amber and explicitly not a missed deadline", () => {
    const s = itemSignal(item({ ageHours: 30 }), indexOf());
    expect(s.level).toBe("warn");
    expect(s.label).toBe("بلا نشاط 24 ساعة+");
    expect(s.detail).toBe("ليس تأخرًا عن موعد");
  });

  test("payment review and delivery are amber «أولوية عالية», never red", () => {
    expect(itemSignal(item({ nextAction: { key: "CONFIRM_PAYMENT", label: "مراجعة الدفع" }, ageHours: 100 }), indexOf())).toMatchObject({ level: "warn", label: "أولوية عالية" });
    expect(itemSignal(item({ nextAction: { key: "DELIVER", label: "إصدار وتسليم" } }), indexOf()).level).toBe("warn");
  });

  test("a genuinely missed deadline outranks everything else on the same request", () => {
    const row = egypt({ id: "x1", pastDue: true });
    expect(itemSignal(item({ nextAction: { key: "CONFIRM_PAYMENT", label: "" }, ageHours: 50 }), indexOf([row])).level).toBe("late");
  });

  test("waiting on the customer is neutral; ordinary work is neutral", () => {
    expect(itemSignal(item({ nextAction: { key: "CUSTOMER_DECISION", label: "" } }), indexOf()).level).toBe("wait");
    expect(itemSignal(item(), indexOf()).level).toBe("normal");
  });
});

test.describe("Operations Center ownership and workload", () => {
  test("owners: orders carry it, Egypt/Umrah come from their queue, other requests are unknown (not «unassigned»)", () => {
    expect(ownerOf(item({ source: "order", assignedUser: "سارة" }), indexOf())).toEqual({ known: true, name: "سارة" });
    expect(ownerOf(item({ source: "order", assignedUser: null }), indexOf())).toEqual({ known: true, name: null });
    expect(ownerOf(item({ id: "eg1" }), indexOf([egypt({ assignedUser: { id: "u1", fullName: "أحمد" } })]))).toEqual({ known: true, name: "أحمد" });
    expect(ownerOf(item({ id: "other" }), indexOf())).toEqual({ known: false, name: null });
  });

  test("workload counts open and late requests per employee, plus the unassigned pile", () => {
    const sara = { id: "s", fullName: "سارة" };
    const result = workload(
      [egypt({ id: "a", assignedUser: sara, pastDue: true }), egypt({ id: "b", assignedUser: sara }), egypt({ id: "c" })],
      [umrah({ id: "d", assignedUser: sara, readiness: { sla: "DUE_TODAY" } })],
    );
    expect(result.people).toEqual([{ id: "s", name: "سارة", open: 3, late: 1 }]);
    expect(result.unassigned).toBe(1);
  });
});
