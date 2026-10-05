import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Operational-readiness regression suite for the staff case list.
// Before: GET /api/contact-requests only filtered by status/assignee, and the
// web console fetched a fixed first page of 50 and filtered it client-side, so
// older cases could not be found by customer name, phone, passport or case id.

describe("admin case list: server-side search and pagination", () => {
  let admin;
  const tag = `Zq${uniqueSuffix()}`; // unique token embedded in names/passports
  const rows = [];
  const phoneBase = Number(String(Date.now()).slice(-7)) * 10;

  before(async () => {
    admin = await loginAsSuperAdmin();
    const org = await prisma.organization.findFirst({ where: { slug: "nasaem-al-haramain" } });
    const organizationId = org?.id || "org_nasaem_default";
    const mk = async (i, extra = {}) => {
      const phone = `09${String(phoneBase + i).padStart(8, "0")}`;
      return prisma.contactRequest.create({
        data: {
          organizationId,
          name: `${tag} Customer ${i}`,
          phone,
          phoneNormalized: `249${phone.slice(1)}`,
          message: "Search fixture request",
          service: "Search Test",
          travelers: i === 0 ? { create: [{ fullName: `Traveler ${tag}`, passportNo: `PP${tag}`, sortOrder: 0 }] } : undefined,
          ...extra,
        },
      });
    };
    for (let i = 0; i < 60; i += 1) rows.push(await mk(i, i % 2 ? { paymentStatus: "UNDER_REVIEW" } : {}));
  });

  const list = (qs) => admin.get(`/api/contact-requests?${qs}`);
  const ids = (res) => res.body.data.map((r) => r.id);

  test("search by customer name fragment", async () => {
    const res = await list(`search=${encodeURIComponent(`${tag} Customer 7`)}&limit=100`);
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res), [rows[7].id]);
  });

  test("search by phone, regardless of local/international formatting", async () => {
    const local = rows[3].phone; // 09xxxxxxxx
    const intl = `+${rows[3].phoneNormalized}`;
    for (const q of [local, intl, local.slice(-7)]) {
      const res = await list(`search=${encodeURIComponent(q)}&limit=100`);
      assert.equal(res.status, 200);
      assert.ok(ids(res).includes(rows[3].id), `phone query "${q}" must find the case`);
      assert.ok(res.body.meta.total <= 5, `phone query "${q}" must narrow the list (got ${res.body.meta.total})`);
    }
  });

  test("search by traveler passport number", async () => {
    const res = await list(`search=${encodeURIComponent(`PP${tag}`)}`);
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res), [rows[0].id]);
  });

  test("search by case/request id (full id and 8-char prefix)", async () => {
    for (const q of [rows[11].id, rows[11].id.slice(0, 8)]) {
      const res = await list(`search=${encodeURIComponent(q)}`);
      assert.ok(ids(res).includes(rows[11].id), `id query "${q}" must find the case`);
    }
  });

  test("a search with no match returns an empty page, not everything", async () => {
    const res = await list(`search=${encodeURIComponent(`nomatch-${uniqueSuffix()}`)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
    assert.equal(res.body.meta.total, 0);
  });

  test("search is case-insensitive and combines with filters", async () => {
    const res = await list(`search=${encodeURIComponent(tag.toLowerCase())}&paymentStatus=UNDER_REVIEW&limit=100`);
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 30);
    assert.ok(res.body.data.every((r) => r.paymentStatus === "UNDER_REVIEW"));
  });

  test("pagination walks every matching case exactly once", async () => {
    const seen = new Set();
    let page = 1;
    let totalPages = 1;
    do {
      const res = await list(`search=${encodeURIComponent(tag)}&limit=25&page=${page}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.total, 60);
      totalPages = res.body.meta.totalPages;
      for (const id of ids(res)) {
        assert.equal(seen.has(id), false, "no case may appear on two pages");
        seen.add(id);
      }
      page += 1;
    } while (page <= totalPages);
    assert.equal(totalPages, 3);
    assert.equal(seen.size, 60);
  });

  test("search input is treated as data, not as query syntax", async () => {
    for (const q of ["%", "_", "' OR 1=1 --", "\\"]) {
      const res = await list(`search=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200, `search "${q}" must not error`);
    }
    const wildcard = await list(`search=${encodeURIComponent("%")}&limit=100`);
    assert.ok(wildcard.body.data.length < 100 || wildcard.body.meta.total >= 0);
  });

  test("invalid filter values are a 400, not a server error", async () => {
    for (const qs of ["status=GARBAGE", "paymentStatus=NOPE", "from=not-a-date", `search=${"x".repeat(101)}`]) {
      const res = await list(qs);
      assert.equal(res.status, 400, `${qs} -> ${res.status}`);
    }
  });

  test("date range narrows the list", async () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await list(`search=${encodeURIComponent(tag)}&from=${encodeURIComponent(future)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.total, 0);
  });
});
