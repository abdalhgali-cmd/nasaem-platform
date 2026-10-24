// Track A4 (AUDIT-00 G-07, owner decision D8): a service or visa type used
// by a request (or, for services, an order) keeps its code and is
// deactivated instead of deleted, so existing requests keep their procedure.
// The catalog row is locked, so a delete racing a request insert waits for
// it. Synthetic data only.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

let superAdmin;
let admin;

before(async () => {
  superAdmin = staffClient(await createStaffUser({ role: "SUPER_ADMIN" }));
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
});

const newService = async () => prisma.service.create({ data: { code: `SVC-PROT-${uniqueSuffix()}`, name: "Protected service", category: "qa-protect", basePrice: 10, currency: "SAR" } });
const newVisaType = async () => prisma.visaType.create({ data: { code: `VISA-PROT-${uniqueSuffix()}`, name: "Protected visa", country: "SA", basePrice: 10, currency: "SAR" } });
const newRequest = (data) => prisma.contactRequest.create({ data: { name: "عميل تجريبي", phone: "0912000000", message: "طلب تجريبي", ...data } });

describe("services", () => {
  test("a service used by a request is deactivated, not deleted; the request keeps its link", async () => {
    const service = await newService();
    const request = await newRequest({ serviceId: service.id });
    const res = await superAdmin.delete(`/api/services/${service.id}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.deactivated, true);
    assert.equal((await prisma.service.findUnique({ where: { id: service.id } })).active, false);
    assert.equal((await prisma.contactRequest.findUnique({ where: { id: request.id } })).serviceId, service.id);
    assert.ok(await prisma.activityLog.findFirst({ where: { action: "SERVICE_DEACTIVATED", entityId: service.id } }));
  });

  test("a service used only by an order item stays protected", async () => {
    const service = await newService();
    const customer = await prisma.customer.create({ data: { customerNo: `CUS-PROT-${uniqueSuffix()}`, fullName: "Order Customer", nationality: "SD" } });
    const order = await prisma.order.create({ data: { orderNumber: `ORD-PROT-${uniqueSuffix()}`, customerId: customer.id, status: "NEW", totalAmount: 10, currency: "SAR" } });
    await prisma.orderItem.create({ data: { orderId: order.id, serviceId: service.id, unitPrice: 10, total: 10 } });
    const res = await superAdmin.delete(`/api/services/${service.id}`);
    assert.equal(res.body.deactivated, true);
    assert.ok(await prisma.service.findUnique({ where: { id: service.id } }));
  });

  test("an unused service is deleted", async () => {
    const service = await newService();
    const res = await superAdmin.delete(`/api/services/${service.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.deactivated, false);
    assert.equal(await prisma.service.findUnique({ where: { id: service.id } }), null);
  });

  test("a used service's code cannot change (409 CODE_IN_USE); its name can; an unused code can", async () => {
    const used = await newService();
    await newRequest({ serviceId: used.id });
    const refused = await admin.patch(`/api/services/${used.id}`).send({ code: `SVC-RENAMED-${uniqueSuffix()}` });
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.code, "CODE_IN_USE");
    assert.equal((await prisma.service.findUnique({ where: { id: used.id } })).code, used.code);
    assert.equal((await admin.patch(`/api/services/${used.id}`).send({ name: "اسم جديد" })).status, 200);
    assert.equal((await admin.patch(`/api/services/${used.id}`).send({ code: used.code })).status, 200, "same code is not a change");
    const unused = await newService();
    assert.equal((await admin.patch(`/api/services/${unused.id}`).send({ code: `SVC-FREE-${uniqueSuffix()}` })).status, 200);
  });

  test("a delete racing an uncommitted request insert waits for it and deactivates instead", async () => {
    const service = await newService();
    let insertDone;
    const inserted = new Promise((resolve) => { insertDone = resolve; });
    const insert = prisma.$transaction(async (tx) => {
      const request = await tx.contactRequest.create({ data: { name: "عميل تجريبي", phone: "0912000000", message: "طلب متزامن", serviceId: service.id } });
      insertDone();
      await new Promise((resolve) => setTimeout(resolve, 400));
      return request;
    });
    await inserted;
    const [request, res] = await Promise.all([insert, superAdmin.delete(`/api/services/${service.id}`)]);
    assert.equal(res.status, 200);
    assert.equal(res.body.deactivated, true, "the delete saw the request once it committed");
    assert.equal((await prisma.contactRequest.findUnique({ where: { id: request.id } })).serviceId, service.id);
  });
});

describe("visa types", () => {
  test("a used visa type keeps its code and is deactivated; an unused one is deleted", async () => {
    const used = await newVisaType();
    await newRequest({ visaTypeId: used.id });
    const refused = await admin.patch(`/api/visa-types/${used.id}`).send({ code: `VISA-RENAMED-${uniqueSuffix()}` });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, "CODE_IN_USE");
    const removed = await superAdmin.delete(`/api/visa-types/${used.id}`);
    assert.equal(removed.body.deactivated, true);
    assert.equal((await prisma.visaType.findUnique({ where: { id: used.id } })).active, false);

    const unused = await newVisaType();
    assert.equal((await superAdmin.delete(`/api/visa-types/${unused.id}`)).body.deactivated, false);
    assert.equal(await prisma.visaType.findUnique({ where: { id: unused.id } }), null);
  });

  test("only SUPER_ADMIN deletes; other roles are refused", async () => {
    const visaType = await newVisaType();
    const service = await newService();
    for (const role of ["ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"]) {
      const client = staffClient(await createStaffUser({ role }));
      assert.equal((await client.delete(`/api/visa-types/${visaType.id}`)).status, 403, role);
      assert.equal((await client.delete(`/api/services/${service.id}`)).status, 403, role);
    }
  });
});
