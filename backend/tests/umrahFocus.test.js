// Manager views of the Umrah work: unassigned, overdue with the agency,
// waiting on the customer and partially issued. Each count is taken over every
// matching request (not one page) under the list's own filters, and the same
// filter opens exactly that list, so an old urgent case beyond page one still
// surfaces.
import "./env.js";
import "./helpers/journeyLimits.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, loginAsSuperAdmin, request, uniqueSuffix } from "./helpers/api.js";
import { refreshUmrahQueueEntry } from "../src/modules/contact-requests/contact-requests.service.js";

const N = 230; // more than two pages of 100
const tag = `QFOC${uniqueSuffix()}`;
const organizationId = "org_nasaem_default";
const yesterday = new Date(Date.now() - 2 * 86_400_000);
let admin;
let service;
let staffId;
const id = (i) => `${tag}-${String(i).padStart(4, "0")}`;
// The special cases are the OLDEST requests: on the default newest-first list
// they sit on page 3.
const OVERDUE = id(N - 1); // unassigned, agency acts next, due date passed
const PARTIAL = id(N - 2); // one of two visas published
const DELAYED = id(N - 3); // a pilgrim's visa marked delayed by staff
const CLOSED = id(N - 4); // unassigned but closed: in no manager view
const CUSTOMER = new Set(Array.from({ length: 7 }, (_, i) => id(10 + i * 20))); // awaiting their transfer

before(async () => {
  admin = await loginAsSuperAdmin();
  staffId = (await prisma.user.findFirst({ where: { organizationId, role: "SUPER_ADMIN" }, select: { id: true } })).id;
  const created = await admin.post("/api/services").send({ code: `TEST-${tag}`, name: `TEST-${tag}`, category: "UMRAH_PACKAGE", basePrice: 100, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  service = created.body.data;
  const base = Date.now();
  const rows = Array.from({ length: N }, (_, i) => {
    const rowId = id(i);
    const waitingCustomer = CUSTOMER.has(rowId);
    return {
      id: rowId,
      organizationId,
      name: `${tag} عميل ${i}`,
      phone: `0901${String(i).padStart(6, "0")}`,
      phoneNormalized: `24991${String(i).padStart(7, "0")}`,
      message: tag,
      serviceId: service.id,
      requestKind: "SERVICE_APPLICATION",
      paymentStatus: waitingCustomer ? "AWAITING_TRANSFER" : "CONFIRMED",
      executionStartedAt: waitingCustomer ? null : new Date(base - 3600_000),
      assignedUserId: [OVERDUE, CLOSED].includes(rowId) ? null : staffId,
      status: rowId === CLOSED ? "CLOSED" : "CONTACTED",
      dueAt: rowId === OVERDUE ? yesterday : null,
      travelerCount: rowId === PARTIAL ? 2 : 1,
      createdAt: new Date(base - i * 60_000),
    };
  });
  await prisma.contactRequest.createMany({ data: rows });
  const partialTravelers = await Promise.all([0, 1].map((n) => prisma.traveler.create({ data: { contactRequestId: PARTIAL, fullName: `${tag} معتمر ${n + 1}`, sortOrder: n, isPrimary: n === 0 } })));
  await prisma.traveler.create({ data: { contactRequestId: DELAYED, fullName: `${tag} معتمر متأخر`, isPrimary: true, visaState: "DELAYED", visaStateReason: "تأخر من الجهة المصدرة" } });
  await prisma.contactRequestDeliverable.create({ data: {
    contactRequestId: PARTIAL, kind: "VISA", label: "تأشيرة المعتمر الأول", fileName: "visa1.pdf", storagePath: `synthetic/${tag}/visa1.pdf`, mimeType: "application/pdf", sizeBytes: 10,
    uploadedByUserId: staffId, publishedAt: new Date(), publishedByUserId: staffId, travelerIds: [partialTravelers[0].id],
  } });
  for (const row of rows) await refreshUmrahQueueEntry(row.id);
  // An entry written before the attention facts existed is re-derived on use.
  await prisma.umrahQueueEntry.update({ where: { contactRequestId: PARTIAL }, data: { waitingOn: null, partialVisas: false } });
});

after(async () => {
  await prisma.contactRequest.deleteMany({ where: { id: { startsWith: `${tag}-` } } });
  await prisma.service.update({ where: { id: service.id }, data: { active: false } }).catch(() => {});
});

const summary = async (qs = "") => {
  const res = await admin.get(`/api/contact-requests/umrah-focus?search=${tag}${qs}`);
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  return res.body.data;
};

async function allIds(qs) {
  const out = [];
  for (let p = 1; ; p++) {
    const res = await admin.get(`/api/contact-requests?serviceKind=UMRAH&search=${tag}&limit=100&page=${p}&${qs}`);
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    out.push(...res.body.data.map((r) => r.id));
    if (p >= res.body.meta.totalPages) return { ids: out, meta: res.body.meta };
  }
}

describe("Umrah manager views", () => {
  test("counts cover every matching request, not one page, and exclude closed cases", async () => {
    const data = await summary();
    assert.equal(data.queueIndex.status, "READY");
    assert.equal(data.truncated, false);
    assert.deepEqual(data.counts, { UNASSIGNED: 1, AGENCY_OVERDUE: 2, WAITING_CUSTOMER: CUSTOMER.size, PARTIAL_VISAS: 1, PAYMENT_REVIEW: 0 });
  });

  test("each count opens exactly its list; the oldest overdue case surfaces on page one", async () => {
    const counts = (await summary()).counts;
    const expected = {
      UNASSIGNED: [OVERDUE],
      AGENCY_OVERDUE: [OVERDUE, DELAYED],
      WAITING_CUSTOMER: [...CUSTOMER],
      PARTIAL_VISAS: [PARTIAL],
    };
    for (const [focus, ids] of Object.entries(expected)) {
      const { ids: listed, meta } = await allIds(`focus=${focus}&sort=queue`);
      assert.equal(meta.total, counts[focus], `${focus}: list total equals its count`);
      assert.deepEqual([...listed].sort(), [...ids].sort(), focus);
    }
    // On the plain newest-first list the overdue case is beyond page one.
    const first = await admin.get(`/api/contact-requests?serviceKind=UMRAH&search=${tag}&limit=100&page=1`);
    assert.ok(!first.body.data.some((r) => r.id === OVERDUE));
    const focused = await admin.get(`/api/contact-requests?serviceKind=UMRAH&search=${tag}&limit=100&page=1&focus=AGENCY_OVERDUE`);
    assert.ok(focused.body.data.some((r) => r.id === OVERDUE));
  });

  test("the counts follow the list's other filters", async () => {
    const mine = await summary("&assignedUserId=mine");
    assert.equal(mine.counts.UNASSIGNED, 0);
    assert.equal(mine.counts.AGENCY_OVERDUE, 1, "only the delayed visa is assigned to me");
    const awaiting = await summary("&paymentStatus=AWAITING_TRANSFER");
    assert.deepEqual(awaiting.counts, { UNASSIGNED: 0, AGENCY_OVERDUE: 0, WAITING_CUSTOMER: CUSTOMER.size, PARTIAL_VISAS: 0, PAYMENT_REVIEW: 0 });
  });

  test("a change to the request moves it between views (no stale cache)", async () => {
    await admin.patch(`/api/contact-requests/${OVERDUE}/assign`).send({ assignedUserId: staffId });
    const res = await summary();
    assert.equal(res.counts.UNASSIGNED, 0);
    assert.equal(res.counts.AGENCY_OVERDUE, 2, "still overdue with the agency once assigned");
  });

  test("an unknown focus is ignored, and the endpoint is staff-only", async () => {
    const { meta } = await allIds("focus=NOPE&sort=queue");
    assert.equal(meta.total, N);
    const anonymous = await request(app).get("/api/contact-requests/umrah-focus");
    assert.equal(anonymous.status, 401);
  });
});
