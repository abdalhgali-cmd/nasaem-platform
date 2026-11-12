// U-10 / T11: the staff Umrah list is ordered and filtered on the server over
// the whole matching set, so page 1 always holds the most urgent requests.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { testPhone } from "./helpers/workflow.js";
import { withUmrahPassports } from "./helpers/umrah-intake.js";
import prisma from "../src/config/database.js";
import { arrangeUmrahQueue } from "../src/modules/umrah/umrah-queue-list.js";

const item = (id, rank, date, ageMinutes, stage = "AWAITING_PAYMENT", kind = "VISA_ONLY") => ({
  row: { id, createdAt: new Date(Date.UTC(2026, 10, 1) - ageMinutes * 60_000), visaType: null, serviceRef: { category: "UMRAH_PACKAGE", features: [`KIND: ${kind}`] }, intakeData: {} },
  progress: { stage },
  queue: { rank, preferredTravelDate: date },
});

describe("arrangeUmrahQueue (pure)", () => {
  const items = Array.from({ length: 250 }, (_, i) => item(`r${String(i).padStart(3, "0")}`, i % 7, i % 3 === 0 ? null : `2027-0${(i % 9) + 1}-10`, i));

  test("queue sort: rank, then nearest date (none last), then newest, then id; pages never overlap or reorder", () => {
    const all = arrangeUmrahQueue(items, { sort: "queue" });
    assert.equal(all.length, 250);
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].queue.rank <= all[i].queue.rank, "rank never decreases");
    const ids = all.map((x) => x.row.id);
    assert.equal(new Set(ids).size, 250);
    assert.deepEqual(arrangeUmrahQueue([...items].reverse(), { sort: "queue" }).map((x) => x.row.id), ids, "input order does not matter");
    const lowestRank = all[0].queue.rank;
    assert.equal(all.slice(0, 20).every((x) => x.queue.rank === lowestRank), true, "the urgent ones fill page 1");
  });

  test("travel sort puts the nearest date first and undated last", () => {
    const all = arrangeUmrahQueue(items, { sort: "travel" });
    const dated = all.filter((x) => x.queue.preferredTravelDate);
    assert.equal(all.slice(0, dated.length).every((x) => x.queue.preferredTravelDate), true);
    for (let i = 1; i < dated.length; i++) assert.ok(dated[i - 1].queue.preferredTravelDate <= dated[i].queue.preferredTravelDate);
  });

  test("stage and package filters apply before paging", () => {
    const mixed = [item("a", 1, null, 1, "PAYMENT_REVIEW", "AIR"), item("b", 1, null, 2, "AWAITING_PAYMENT", "AIR"), item("c", 1, null, 3, "PAYMENT_REVIEW", "SEA")];
    assert.deepEqual(arrangeUmrahQueue(mixed, { stage: "PAYMENT_REVIEW" }).map((x) => x.row.id), ["a", "c"]);
    assert.deepEqual(arrangeUmrahQueue(mixed, { packageKind: "AIR" }).map((x) => x.row.id), ["a", "b"]);
    assert.deepEqual(arrangeUmrahQueue(mixed, { stage: "PAYMENT_REVIEW", packageKind: "SEA" }).map((x) => x.row.id), ["c"]);
  });
});

describe("GET /contact-requests?serviceKind=UMRAH&sort=queue", () => {
  let admin;
  let service;
  const tag = uniqueSuffix();
  const ids = [];

  before(async () => {
    admin = await loginAsSuperAdmin();
    const created = await admin.post("/api/services").send({ code: `TEST-QUEUE-${tag}`, name: `TEST-QUEUE ${tag}`, category: "UMRAH_PACKAGE", basePrice: 1000, currency: "SAR", active: true, pricingMode: "FIXED", priceUnit: "PER_TRAVELER", features: ["KIND: VISA_ONLY"] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    service = created.body.data;
    for (let i = 0; i < 3; i++) {
      const res = await withUmrahPassports(request(app)
        .post("/api/contact-requests")
        .field("name", `TEST-QUEUE-${tag} عميل ${i}`)
        .field("phone", testPhone())
        .field("service", service.name)
        .field("serviceId", service.id)
        .field("message", "TEST-QUEUE")
        .field("travelerCount", "1")
        .field("travelers", JSON.stringify([{ fullName: "معتمر", isPrimary: true }]))
        .field("acceptedTotal", "1000")
        .field("acceptedCurrency", "SAR")
        .field("guarantorPhone", "+966 50 123 4567"), service.id, 1);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      ids.push(res.body.data.id);
      await new Promise((r) => setTimeout(r, 15));
    }
    // The OLDEST request is the one waiting for a finance decision.
    await prisma.contactRequest.update({ where: { id: ids[0] }, data: { paymentStatus: "UNDER_REVIEW" } });
  });

  const list = (qs) => admin.get(`/api/contact-requests?serviceKind=UMRAH&search=TEST-QUEUE-${tag}&${qs}`);

  test("default order is newest first; sort=queue brings the oldest-but-urgent request to page 1", async () => {
    const newest = await list("limit=1");
    assert.equal(newest.body.data[0].id, ids[2]);
    const queue = await list("sort=queue&limit=1");
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.data[0].id, ids[0], "finance review is the most urgent");
    assert.equal(queue.body.data[0].umrahQueue.rank, 0);
    assert.equal(queue.body.meta.total ?? queue.body.meta.totalItems, 3);
    assert.equal(queue.body.meta.truncated, false);
    const page2 = await list("sort=queue&limit=1&page=2");
    const page3 = await list("sort=queue&limit=1&page=3");
    assert.deepEqual([queue.body.data[0].id, page2.body.data[0].id, page3.body.data[0].id].sort(), [...ids].sort(), "three pages, no overlap");
  });

  test("stage filter is applied before paging", async () => {
    const review = await list("stage=PAYMENT_REVIEW&limit=20");
    assert.equal(review.status, 200);
    assert.deepEqual(review.body.data.map((r) => r.id), [ids[0]]);
    const none = await list("stage=CLOSED&limit=20");
    assert.equal(none.body.data.length, 0);
  });

  test("package filter and an unknown sort fall back safely", async () => {
    assert.equal((await list("packageKind=VISA_ONLY&limit=20")).body.data.length, 3);
    assert.equal((await list("packageKind=AIR&limit=20")).body.data.length, 0);
    const unknown = await list("sort=nonsense&limit=1");
    assert.equal(unknown.body.data[0].id, ids[2], "unknown sort = default order");
  });
});
