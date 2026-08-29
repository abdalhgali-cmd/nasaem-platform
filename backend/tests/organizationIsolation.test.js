import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { getFinancialReport } from "../src/modules/finance/finance.service.js";
import { getDashboardStats, getDashboardSummary, getOperationsCenter } from "../src/modules/dashboard/dashboard.service.js";

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

  test("payments, documents and the finance report are scoped to the caller's organization", async () => {
    const suffix = uniqueSuffix();
    const agent = await loginAsSuperAdmin();
    const otherOrganization = await prisma.organization.create({
      data: { slug: `other-finance-agency-${suffix}`, name: `Other Finance Agency ${suffix}` },
    });
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrganization.id,
        employeeNo: `OTHER-EMP-${suffix}`,
        fullName: `Other Tenant Staff ${suffix}`,
        email: `other-staff-${suffix}@example.com`,
        passwordHash: "not-a-real-hash",
        role: "ADMIN",
      },
    });
    const otherCustomer = await prisma.customer.create({
      data: {
        organizationId: otherOrganization.id,
        customerNo: `OTHER-FIN-${suffix}`,
        fullName: `Other Finance Customer ${suffix}`,
        passportNo: `OTHERFINPASS${suffix}`,
      },
    });
    const otherOrder = await prisma.order.create({
      data: {
        organizationId: otherOrganization.id,
        orderNumber: `OTHER-FIN-ORDER-${suffix}`,
        customerId: otherCustomer.id,
        totalAmount: 500,
      },
    });
    const otherPayment = await prisma.payment.create({
      data: { orderId: otherOrder.id, amount: 200, paymentMethod: "CASH", status: "UNPAID", reviewStatus: "PENDING" },
    });
    const otherDocument = await prisma.document.create({
      data: {
        orderId: otherOrder.id,
        customerId: otherCustomer.id,
        uploadedById: otherUser.id,
        type: "PASSPORT",
        fileName: "other-tenant-passport.jpg",
        storagePath: `documents/other-tenant-${suffix}.jpg`,
      },
    });

    // Payments: list/read/confirm/reject on another organization's payment.
    const paymentList = await agent.get(`/api/payments?orderId=${otherOrder.id}`);
    assert.equal(paymentList.status, 200);
    assert.equal(paymentList.body.data.length, 0);
    assert.equal((await agent.get(`/api/payments/${otherPayment.id}`)).status, 404);
    assert.equal((await agent.post(`/api/payments/${otherPayment.id}/confirm`).send({})).status, 404);
    assert.equal((await agent.post(`/api/payments/${otherPayment.id}/reject`).send({ reason: "leaked" })).status, 404);
    // Creating a payment against another organization's order must also fail.
    assert.equal(
      (await agent.post("/api/payments").send({ orderId: otherOrder.id, amount: 100, paymentMethod: "CASH" })).status,
      404
    );

    // Documents: list/read/delete on another organization's document.
    const documentList = await agent.get("/api/documents");
    assert.equal(documentList.status, 200);
    assert.equal(documentList.body.data.some((doc) => doc.id === otherDocument.id), false);
    assert.equal((await agent.get(`/api/documents/${otherDocument.id}`)).status, 404);
    assert.equal((await agent.delete(`/api/documents/${otherDocument.id}`)).status, 404);
    const stillExists = await prisma.document.findUnique({ where: { id: otherDocument.id } });
    assert.ok(stillExists, "another organization's document must not be deletable");

    // Finance report: a brand-new organization has no orders of its own
    // except this fixture, so a scoped report must return exactly this one
    // order — if the `organizationId` filter were ignored, this would
    // instead return every order in the whole test database.
    const otherReport = await getFinancialReport({ organizationId: otherOrganization.id });
    assert.equal(otherReport.totals.ordersCount, 1, "a fresh organization's report must be scoped to only its own order");
    assert.equal(otherReport.totals.revenue, 500);
  });

  test("dashboard stats, operations center and summary are scoped to the caller's organization", async () => {
    const suffix = uniqueSuffix();
    const otherOrganization = await prisma.organization.create({
      data: { slug: `other-dash-agency-${suffix}`, name: `Other Dashboard Agency ${suffix}` },
    });
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrganization.id,
        employeeNo: `OTHER-DASH-EMP-${suffix}`,
        fullName: `Other Dashboard Staff ${suffix}`,
        email: `other-dash-staff-${suffix}@example.com`,
        passwordHash: "not-a-real-hash",
        role: "ADMIN",
      },
    });
    const otherCustomer = await prisma.customer.create({
      data: {
        organizationId: otherOrganization.id,
        customerNo: `OTHER-DASH-${suffix}`,
        fullName: `Other Dashboard Customer ${suffix}`,
        passportNo: `OTHERDASHPASS${suffix}`,
      },
    });
    const otherOrder = await prisma.order.create({
      data: {
        organizationId: otherOrganization.id,
        orderNumber: `OTHER-DASH-ORDER-${suffix}`,
        customerId: otherCustomer.id,
        totalAmount: 300,
        status: "WAITING_DOCUMENTS",
      },
    });
    await prisma.payment.create({
      data: { orderId: otherOrder.id, amount: 150, paymentMethod: "CASH", status: "PAID" },
    });
    await prisma.contactRequest.create({
      data: {
        organizationId: otherOrganization.id,
        customerId: otherCustomer.id,
        name: otherCustomer.fullName,
        phone: `249dash${suffix}`,
        phoneNormalized: `249dash${suffix}`,
        message: "Cross-tenant dashboard fixture",
      },
    });

    // A brand-new organization has exactly this one fixture set — if the
    // organizationId filter were ignored, these counts would instead
    // reflect the whole shared test database (hundreds of rows from every
    // other test file), not exactly 1.
    const stats = await getDashboardStats(otherOrganization.id);
    assert.equal(stats.customers, 1);
    assert.equal(stats.orders, 1);
    assert.equal(stats.users, 1);
    assert.equal(stats.payments, 1);
    assert.equal(stats.latestOrders.length, 1);
    assert.equal(stats.latestOrders[0].id, otherOrder.id);

    const operations = await getOperationsCenter(otherOrganization.id);
    assert.equal(operations.items.length, 2, "expected exactly the one contact request and one order fixture");
    assert.ok(operations.items.some((item) => item.source === "order" && item.reference === otherOrder.orderNumber));
    assert.equal(operations.queues.waitingDocuments, 1);

    const summary = await getDashboardSummary(otherOrganization.id);
    assert.equal(summary.periods.today.orders, 1);
    assert.equal(Number(summary.periods.today.paid), 150);
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
