import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

describe("ferry intake", () => {
  let adminAgent;
  let ferryServiceId;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();
    const catalogRes = await request(app).get("/api/services/public");
    assert.equal(catalogRes.status, 200);

    const ferry = catalogRes.body.data.services.find((service) => service.code === "SVC-FERRY");
    assert.ok(ferry, "expected SVC-FERRY in the public catalog");
    assert.equal(ferry.category, "ferry");
    ferryServiceId = ferry.id;
  });

  test("creates a structured ferry request through the existing contact-request workflow", async () => {
    const phone = `096${uniqueSuffix()}`;
    const travelDate = "2030-01-15";

    const res = await request(app).post("/api/contact-requests").send({
      name: "Ferry Intake Test",
      phone,
      service: "حجز العبارات",
      serviceId: ferryServiceId,
      travelerCount: 3,
      intakeData: {
        route: "سواكن → جدة",
        travelDate,
        travelers: 3,
        carrier: "تاركو البحرية",
        notes: "3 ركاب مع تفضيل الرحلة الصباحية",
      },
      message: `طلب حجز عبارة: سواكن → جدة بتاريخ ${travelDate}`,
    });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.data.id;

    const listRes = await adminAgent.get("/api/contact-requests?limit=50");
    assert.equal(listRes.status, 200);
    const found = listRes.body.data.find((item) => item.id === id);

    assert.ok(found, "expected the ferry request in the staff list");
    assert.equal(found.serviceId, ferryServiceId);
    assert.equal(found.travelerCount, 3);
    assert.equal(found.intakeData.route, "سواكن → جدة");
    assert.equal(found.intakeData.travelDate, travelDate);
    assert.equal(found.intakeData.carrier, "تاركو البحرية");
  });
});
