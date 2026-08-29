import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("organization tenant boundary", () => {
  test("Nasaem staff cannot list, read, mutate, or create records for another organization", async () => {
    const suffix = uniqueSuffix();
    const agent = await loginAsSuperAdmin();
    const otherOrganization = await prisma.organization.create({
      data: { slug: `other-agency-${suffix}`, name: `Other Agency ${suffix}` },
    });
    const otherCustomer = await prisma.customer.create({
      data: {
        organizationId: otherOrganization.id,
        customerNo: `OTHER-${suffix}`,
        fullName: `Other Tenant Customer ${suffix}`,
        passportNo: `OTHERPASS${suffix}`,
      },
    });
    const otherOrder = await prisma.order.create({
      data: {
        organizationId: otherOrganization.id,
        orderNumber: `OTHER-ORDER-${suffix}`,
        customerId: otherCustomer.id,
        totalAmount: 100,
      },
    });
    const otherRequest = await prisma.contactRequest.create({
      data: {
        organizationId: otherOrganization.id,
        customerId: otherCustomer.id,
        name: otherCustomer.fullName,
        phone: `249${suffix}`,
        phoneNormalized: `249${suffix}`,
        message: "Cross-tenant fixture",
      },
    });
    const service = await prisma.service.findFirst({ where: { active: true }, select: { id: true } });
    assert.ok(service, "seeded service is required for the cross-tenant create attempt");

    const customerList = await agent.get(`/api/customers?search=${encodeURIComponent(otherCustomer.passportNo)}`);
    assert.equal(customerList.status, 200);
    assert.equal(customerList.body.data.length, 0);
    assert.equal((await agent.get(`/api/customers/${otherCustomer.id}`)).status, 404);
    assert.equal((await agent.patch(`/api/customers/${otherCustomer.id}`).send({ city: "Leaked" })).status, 404);

    const orderList = await agent.get(`/api/orders?search=${encodeURIComponent(otherOrder.orderNumber)}`);
    assert.equal(orderList.status, 200);
    assert.equal(orderList.body.data.length, 0);
    assert.equal((await agent.get(`/api/orders/${otherOrder.id}`)).status, 404);
    assert.equal((await agent.patch(`/api/orders/${otherOrder.id}/status`).send({ status: "UNDER_REVIEW" })).status, 404);
    assert.equal(
      (await agent.post("/api/orders").send({ customerId: otherCustomer.id, items: [{ serviceId: service.id, quantity: 1, unitPrice: 100 }] })).status,
      404
    );

    const requestList = await agent.get("/api/contact-requests");
    assert.equal(requestList.status, 200);
    assert.equal(requestList.body.data.some((item) => item.id === otherRequest.id), false);
    assert.equal((await agent.patch(`/api/contact-requests/${otherRequest.id}/status`).send({ status: "CONTACTED" })).status, 404);
  });

  test("database rejects an order whose organization differs from its customer", async () => {
    const suffix = uniqueSuffix();
    const otherOrganization = await prisma.organization.create({
      data: { slug: `mismatch-agency-${suffix}`, name: `Mismatch Agency ${suffix}` },
    });
    const defaultCustomer = await prisma.customer.create({
      data: { customerNo: `DEFAULT-${suffix}`, fullName: `Default Customer ${suffix}` },
    });

    await assert.rejects(() =>
      prisma.order.create({
        data: {
          organizationId: otherOrganization.id,
          orderNumber: `MISMATCH-${suffix}`,
          customerId: defaultCustomer.id,
          totalAmount: 1,
        },
      })
    );
  });
});
