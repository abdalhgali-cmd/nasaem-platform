import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

describe("staff request search and filters", () => {
  let staff;
  let id;
  const passportNo = `ZX${uniqueSuffix()}`;
  const name = `بحث ${uniqueSuffix()}`;

  before(async () => {
    staff = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
    const res = await request(app)
      .post("/api/contact-requests")
      .send({
        name,
        phone: `0912${uniqueSuffix()}`.slice(0, 14),
        message: "طلب لاختبار البحث",
        travelers: [{ fullName: "Second Traveler Name", passportNo, nationality: "Sudan", isPrimary: true }],
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    id = res.body.data.id;
  });

  after(async () => {
    await prisma.contactRequest.deleteMany({ where: { id } });
  });

  const ids = async (query) => {
    const res = await staff.get(`/api/contact-requests?limit=100&${query}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data.map((row) => row.id);
  };

  test("finds a request by its number, the customer's name, or a traveler's passport number", async () => {
    assert.ok((await ids(`search=${encodeURIComponent(id)}`)).includes(id));
    assert.ok((await ids(`search=${encodeURIComponent(name)}`)).includes(id));
    assert.ok((await ids(`search=${encodeURIComponent(passportNo.toLowerCase())}`)).includes(id));
    assert.ok((await ids(`search=${encodeURIComponent("second traveler")}`)).includes(id));
    assert.equal((await ids(`search=${encodeURIComponent(`${passportNo}-nope`)}`)).includes(id), false);
  });

  test("filters by creation date and ignores values that are not real statuses", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    assert.ok((await ids(`createdFrom=${today}&createdTo=${tomorrow}`)).includes(id));
    assert.equal((await ids(`createdFrom=${tomorrow}`)).includes(id), false);
    assert.equal((await ids(`createdTo=${yesterday}`)).includes(id), false);
    const odd = await staff.get("/api/contact-requests?status=NOT_A_STATUS&paymentStatus=%27%3B--");
    assert.equal(odd.status, 200);
  });
});
