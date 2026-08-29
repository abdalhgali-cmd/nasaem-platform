import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { getSystemActorId } from "../src/utils/systemActor.js";
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

  test("customer request, document and deliverable surfaces stay scoped to the authenticated customer", async () => {
    const { agent: customerAAgent, customer: customerA } = await registerCustomer({
      fullName: "Resource Isolation Customer A",
      phone: `24995${uniqueSuffix()}`,
    });
    const { agent: customerBAgent, customer: customerB } = await registerCustomer({
      fullName: "Resource Isolation Customer B",
      phone: `24996${uniqueSuffix()}`,
    });

    const suffix = uniqueSuffix();
    const requestA = await prisma.contactRequest.create({
      data: {
        name: "Private request A",
        phone: customerA.phone,
        phoneNormalized: customerA.phone,
        message: "Only customer A may see this request",
        customerId: customerA.id,
      },
    });
    const requestB = await prisma.contactRequest.create({
      data: {
        name: "Private request B",
        phone: customerB.phone,
        phoneNormalized: customerB.phone,
        message: "Only customer B may see this request",
        customerId: customerB.id,
      },
    });

    const aRequestList = await customerAAgent.get("/api/customer/requests?limit=100");
    assert.equal(aRequestList.status, 200, JSON.stringify(aRequestList.body));
    assert.ok(aRequestList.body.data.some((request) => request.id === requestA.id));
    assert.ok(!aRequestList.body.data.some((request) => request.id === requestB.id));

    const bRequestList = await customerBAgent.get("/api/customer/requests?limit=100");
    assert.equal(bRequestList.status, 200, JSON.stringify(bRequestList.body));
    assert.ok(bRequestList.body.data.some((request) => request.id === requestB.id));
    assert.ok(!bRequestList.body.data.some((request) => request.id === requestA.id));

    const aReadsBRequest = await customerAAgent.get(`/api/customer/requests/${requestB.id}`);
    assert.equal(aReadsBRequest.status, 404, "Customer A must not read Customer B's request by guessed id");

    const bReadsARequest = await customerBAgent.get(`/api/customer/requests/${requestA.id}`);
    assert.equal(bReadsARequest.status, 404, "Customer B must not read Customer A's request by guessed id");

    const systemActorId = await getSystemActorId();
    const orderA = await prisma.order.create({
      data: {
        orderNumber: `DOC-A-${suffix}`,
        customerId: customerA.id,
        totalAmount: 10,
        currency: "SAR",
      },
    });
    const orderB = await prisma.order.create({
      data: {
        orderNumber: `DOC-B-${suffix}`,
        customerId: customerB.id,
        totalAmount: 20,
        currency: "SAR",
      },
    });

    const documentA = await prisma.document.create({
      data: {
        orderId: orderA.id,
        customerId: customerA.id,
        uploadedById: systemActorId,
        type: "OTHER",
        fileName: "private-a.txt",
        storagePath: "security-tests/private-a.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
      },
    });
    const documentB = await prisma.document.create({
      data: {
        orderId: orderB.id,
        customerId: customerB.id,
        uploadedById: systemActorId,
        type: "OTHER",
        fileName: "private-b.txt",
        storagePath: "security-tests/private-b.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
      },
    });

    const aDocuments = await customerAAgent.get("/api/customer/documents");
    assert.equal(aDocuments.status, 200, JSON.stringify(aDocuments.body));
    assert.ok(aDocuments.body.data.some((document) => document.id === documentA.id));
    assert.ok(!aDocuments.body.data.some((document) => document.id === documentB.id));

    const bDocuments = await customerBAgent.get("/api/customer/documents");
    assert.equal(bDocuments.status, 200, JSON.stringify(bDocuments.body));
    assert.ok(bDocuments.body.data.some((document) => document.id === documentB.id));
    assert.ok(!bDocuments.body.data.some((document) => document.id === documentA.id));

    const deliverableB = await prisma.contactRequestDeliverable.create({
      data: {
        contactRequestId: requestB.id,
        label: "Private B deliverable",
        fileName: "private-b.pdf",
        storagePath: "security-tests/private-b.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadedByUserId: systemActorId,
      },
    });

    const aDownloadsBDeliverable = await customerAAgent.get(
      `/api/customer/requests/${requestB.id}/deliverables/${deliverableB.id}/file`
    );
    assert.equal(
      aDownloadsBDeliverable.status,
      404,
      "Customer A must not download Customer B's deliverable even with both direct ids"
    );
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
