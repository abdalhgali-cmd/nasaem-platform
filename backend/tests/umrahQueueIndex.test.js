// T11: the Umrah queue is ordered and paged in SQL over a rebuildable cache, so
// there is no 500-row limit and no hidden truncation. The cache is never
// trusted over the request: shown rows are re-derived and repaired, missing
// entries are healed or openly reported, and the rebuild is dry-run first.
import "./env.js";
import "./helpers/journeyLimits.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { rebuildUmrahQueueEntries, refreshUmrahQueueEntry } from "../src/modules/contact-requests/contact-requests.service.js";

const N = 650; // more than the old in-memory limit of 500
let admin;
let service;
let organizationId;
const tag = `QIDX${uniqueSuffix()}`;
const ids = [];

before(async () => {
  admin = await loginAsSuperAdmin();
  const created = await admin.post("/api/services").send({ code: `TEST-${tag}`, name: `TEST-${tag}`, category: "UMRAH_PACKAGE", basePrice: 100, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: AIR"] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  service = created.body.data;
  organizationId = "org_nasaem_default";
  const base = Date.now();
  const statuses = ["AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED", "NOT_REQUIRED"];
  const rows = Array.from({ length: N }, (_, i) => ({
    id: `${tag}-${String(i).padStart(4, "0")}`,
    organizationId,
    name: `${tag} عميل ${i}`,
    phone: `0900${String(i).padStart(6, "0")}`,
    phoneNormalized: `24990${String(i).padStart(7, "0")}`,
    message: tag,
    serviceId: service.id,
    requestKind: "SERVICE_APPLICATION",
    paymentStatus: statuses[i % 4],
    travelerCount: 1,
    intakeData: { umrahTravel: i % 3 === 0 ? { preferredDateMissing: true } : { preferredDate: `2027-0${(i % 9) + 1}-1${i % 9}`, provisional: true } },
    createdAt: new Date(base - i * 1000),
  }));
  await prisma.contactRequest.createMany({ data: rows });
  rows.forEach((r) => ids.push(r.id));
  await Promise.all(ids.map((id) => refreshUmrahQueueEntry(id)));
});

// The synthetic requests (and, by cascade, their queue entries) are removed so other suites
// that count requests are not affected.
after(async () => {
  await prisma.contactRequest.deleteMany({ where: { id: { startsWith: `${tag}-` } } });
  await prisma.service.update({ where: { id: service.id }, data: { active: false } }).catch(() => {});
});

const page = (qs) => admin.get(`/api/contact-requests?serviceKind=UMRAH&search=${tag}&${qs}`);

async function allPages(qs) {
  const out = [];
  let meta;
  for (let p = 1; ; p++) {
    const res = await page(`${qs}&limit=100&page=${p}`);
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    meta = res.body.meta;
    out.push(...res.body.data);
    if (p >= meta.totalPages) break;
  }
  return { rows: out, meta };
}

describe("Umrah queue over the persisted cache", () => {
  test("650 requests (beyond the old limit of 500): every one appears once, in global priority order, nothing truncated", async () => {
    const { rows, meta } = await allPages("sort=queue");
    assert.equal(meta.total, N);
    assert.equal(meta.truncated, false, "no hidden truncation");
    assert.equal(meta.queueIndex.status, "READY");
    assert.equal(new Set(rows.map((r) => r.id)).size, N);
    assert.deepEqual([...new Set(rows.map((r) => r.id))].sort(), [...ids].sort(), "exactly the requests that exist");
    const key = (r) => [r.umrahQueue.rank, r.umrahQueue.preferredTravelDate || "9999-99-99", -new Date(r.createdAt).getTime(), r.id];
    for (let i = 1; i < rows.length; i++) {
      const a = key(rows[i - 1]);
      const b = key(rows[i]);
      assert.ok(a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && (a[2] < b[2] || (a[2] === b[2] && a[3] > b[3]))))), `order broken at ${i}`);
    }
    // the most urgent is on page 1 even though it is among the oldest created
    const minRank = Math.min(...rows.map((r) => r.umrahQueue.rank));
    assert.equal(rows[0].umrahQueue.rank, minRank);
  });

  test("travel sort and stage / package filters page correctly across the whole set", async () => {
    const travel = await allPages("sort=travel");
    const dated = travel.rows.filter((r) => r.umrahQueue.preferredTravelDate);
    assert.equal(travel.rows.slice(0, dated.length).every((r) => r.umrahQueue.preferredTravelDate), true, "dated first, undated last");
    const review = await allPages("stage=PAYMENT_REVIEW");
    assert.ok(review.meta.total > 100 && review.rows.every((r) => r.progress.stage === "PAYMENT_REVIEW"));
    assert.equal((await allPages("packageKind=SEA")).meta.total, 0);
    assert.equal((await allPages("packageKind=AIR")).meta.total, N);
  });

  test("a wrong cached entry is never trusted: the shown row is derived now and the entry repaired", async () => {
    const urgent = (await allPages("sort=queue")).rows[0];
    await prisma.umrahQueueEntry.update({ where: { contactRequestId: urgent.id }, data: { rank: 9, stage: "CLOSED" } });
    const res = await page("sort=queue&limit=100&page=1");
    const shown = res.body.data.find((r) => r.id === urgent.id);
    // it may have dropped out of page 1 because of the wrong entry, but whatever page shows it reports the truth
    const found = shown || (await allPages("sort=queue")).rows.find((r) => r.id === urgent.id);
    assert.equal(found.progress.stage, urgent.progress.stage, "derived from the request, not the cache");
    await new Promise((r) => setTimeout(r, 400));
    const after = await prisma.umrahQueueEntry.findUnique({ where: { contactRequestId: urgent.id } });
    assert.equal(after.rank, urgent.umrahQueue.rank, "repaired");
    assert.equal(after.stage, urgent.progress.stage);
  });

  test("missing entries are healed, or the list says it is still building (bounded sweep, flagged)", async () => {
    await prisma.umrahQueueEntry.deleteMany({ where: { contactRequestId: { in: ids.slice(0, 150) } } });
    const first = await page("sort=queue&limit=20");
    assert.equal(first.status, 200);
    assert.equal(first.body.meta.queueIndex.status, "BUILDING", "150 missing > one healing batch of 100: said openly");
    assert.equal(first.body.meta.queueIndex.missing, 50);
    assert.equal(typeof first.body.meta.truncated, "boolean");
    const second = await page("sort=queue&limit=20");
    assert.equal(second.body.meta.queueIndex.status, "READY", "the next call heals the rest");
    assert.equal(second.body.meta.total, N);
  });

  test("rebuild: dry run reports and writes nothing; applying repairs exactly the differences", async () => {
    await prisma.umrahQueueEntry.deleteMany({ where: { contactRequestId: { in: ids.slice(0, 3) } } });
    await prisma.umrahQueueEntry.update({ where: { contactRequestId: ids[10] }, data: { rank: 7 } });
    await prisma.umrahQueueEntry.update({ where: { contactRequestId: ids[11] }, data: { packageKind: "SEA" } });
    const before = await prisma.umrahQueueEntry.count();
    const dry = await rebuildUmrahQueueEntries({ organizationId });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.written, 0);
    assert.ok(dry.missing >= 3 && dry.mismatched >= 2, JSON.stringify(dry));
    assert.equal(await prisma.umrahQueueEntry.count(), before, "dry run changes nothing");
    const applied = await rebuildUmrahQueueEntries({ organizationId, dryRun: false });
    assert.equal(applied.written, applied.missing + applied.mismatched);
    const clean = await rebuildUmrahQueueEntries({ organizationId });
    assert.equal(clean.missing + clean.mismatched, 0, "nothing left to repair");
    assert.equal(await prisma.contactRequest.count({ where: { id: { in: ids } } }), N, "no request was touched");
  });

  test("a workflow transaction refreshes the entry after it commits", async () => {
    const id = ids[1]; // paymentStatus UNDER_REVIEW at creation
    await prisma.umrahQueueEntry.update({ where: { contactRequestId: id }, data: { rank: 3, stage: "IN_EXECUTION" } });
    // any workflow action runs through withLockedRequest; a refused one must not refresh
    const accountant = await (await import("./helpers/staff.js")).createStaffUser({ role: "ACCOUNTANT" });
    const { staffClient } = await import("./helpers/staff.js");
    const reject = await staffClient(accountant).post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "اختبار الفهرس" });
    assert.equal(reject.status, 200, JSON.stringify(reject.body));
    let entry;
    for (let i = 0; i < 20; i++) {
      entry = await prisma.umrahQueueEntry.findUnique({ where: { contactRequestId: id } });
      if (entry.rank !== 3) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.notEqual(entry.rank, 3, "the entry followed the committed change");
  });
});
