import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { registerCustomer, uniqueSuffix } from "./helpers/api.js";

describe("customer A/B isolation", () => {
  test("customer portal never exposes another customer's order by list or direct id", async () => {
    const { agent: customerAAgent, customer: customerA } = await registerCustomer({
      fullName: "Isolation Customer A",
      phone: `24991${uniqueSuffix()}`,
    });
    const { agent: customerBAgent, customer: customerB } = await registerCustomer({
      fullName: "Isolation Customer B",
      phone: `24992${uniqueSuffix()}`,
    });

    const suffix = uniqueSuffix();
    const orderA = await prisma.order.create({
      data: {
        orderNumber: `ISO-A-${suffix}`,
        customerId: customerA.id,
        totalAmount: 100,
        currency: "SAR",
      },
    });
    const orderB = await prisma.order.create({
      data: {
        orderNumber: `ISO-B-${suffix}`,
        customerId: customerB.id,
        totalAmount: 200,
        currency: "SAR",
      },
    });

    const aList = await customerAAgent.get("/api/customer/orders?limit=100");
    assert.equal(aList.status, 200, JSON.stringify(aList.body));
    assert.ok(aList.body.data.some((order) => order.id === orderA.id));
    assert.ok(!aList.body.data.some((order) => order.id === orderB.id));

    const bList = await customerBAgent.get("/api/customer/orders?limit=100");
    assert.equal(bList.status, 200, JSON.stringify(bList.body));
    assert.ok(bList.body.data.some((order) => order.id === orderB.id));
    assert.ok(!bList.body.data.some((order) => order.id === orderA.id));

    const aOwn = await customerAAgent.get(`/api/customer/orders/${orderA.id}`);
    assert.equal(aOwn.status, 200, JSON.stringify(aOwn.body));
    assert.equal(aOwn.body.data.id, orderA.id);

    const bOwn = await customerBAgent.get(`/api/customer/orders/${orderB.id}`);
    assert.equal(bOwn.status, 200, JSON.stringify(bOwn.body));
    assert.equal(bOwn.body.data.id, orderB.id);

    const aReadsB = await customerAAgent.get(`/api/customer/orders/${orderB.id}`);
    assert.equal(aReadsB.status, 404, "Customer A must not be able to read Customer B's order by guessed id");

    const bReadsA = await customerBAgent.get(`/api/customer/orders/${orderA.id}`);
    assert.equal(bReadsA.status, 404, "Customer B must not be able to read Customer A's order by guessed id");
  });

  test("customer notification mutation is scoped to the authenticated customer", async () => {
    const { agent: customerAAgent, customer: customerA } = await registerCustomer({
      fullName: "Notification Isolation Customer A",
      phone: `24993${uniqueSuffix()}`,
    });
    const { agent: customerBAgent, customer: customerB } = await registerCustomer({
      fullName: "Notification Isolation Customer B",
      phone: `24994${uniqueSuffix()}`,
    });

    const notificationA = await prisma.notification.create({
      data: {
        customerId: customerA.id,
        title: "Private A notification",
        message: "Only customer A may mutate this notification",
        type: "SECURITY_TEST",
      },
    });

    const notificationB = await prisma.notification.create({
      data: {
        customerId: customerB.id,
        title: "Private B notification",
        message: "Only customer B may mutate this notification",
        type: "SECURITY_TEST",
      },
    });

    const aReadsB = await customerAAgent.patch(`/api/customer/notifications/${notificationB.id}/read`);
    assert.equal(aReadsB.status, 404);

    const bReadsA = await customerBAgent.patch(`/api/customer/notifications/${notificationA.id}/read`);
    assert.equal(bReadsA.status, 404);

    const aOwn = await customerAAgent.patch(`/api/customer/notifications/${notificationA.id}/read`);
    assert.equal(aOwn.status, 200, JSON.stringify(aOwn.body));
    assert.ok(aOwn.body.data.readAt);

    const bOwn = await customerBAgent.patch(`/api/customer/notifications/${notificationB.id}/read`);
    assert.equal(bOwn.status, 200, JSON.stringify(bOwn.body));
    assert.ok(bOwn.body.data.readAt);
  });
});
