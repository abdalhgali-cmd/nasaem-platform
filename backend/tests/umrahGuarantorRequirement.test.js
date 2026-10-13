import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

// Umrah asks for the guarantor's residence permit instead of a personal
// photo (migration 20261015100000_umrah_guarantor_residence + seed). The
// photo requirement is deactivated, never deleted; other packages and visas
// keep their own checklists.

async function publicChecklist(path) {
  const res = await request(app).get(`/api/${path}/requirements/public`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.map((row) => row.name);
}

describe("Umrah document checklist", () => {
  for (const code of ["SVC-UMRAH", "SVC-UMRAH-VISA", "SVC-UMRAH-SERVICES", "SVC-UMRAH-GROUP"]) {
    test(`${code}: guarantor residence instead of the personal photo, passport kept`, async () => {
      const service = await prisma.service.findUnique({ where: { code } });
      assert.ok(service, `${code} is seeded`);
      const names = await publicChecklist(`services/${service.id}`);
      assert.ok(names.includes("إقامة الضامن"), JSON.stringify(names));
      assert.ok(names.some((name) => name.includes("جواز")), "passport is still required");
      assert.ok(!names.some((name) => name.includes("الصورة الشخصية")), JSON.stringify(names));
      const guarantor = await prisma.visaRequirement.findFirst({ where: { serviceId: service.id, name: "إقامة الضامن" } });
      assert.equal(guarantor.scope, "CASE", "one guarantor residence per request");
      assert.equal(guarantor.type, "DOCUMENT");
      assert.equal(guarantor.required, true);
    });
  }

  test("VISA-UMRAH keeps its guarantor residence and drops the personal photo", async () => {
    const visa = await prisma.visaType.findUnique({ where: { code: "VISA-UMRAH" } });
    const names = await publicChecklist(`visa-types/${visa.id}`);
    assert.ok(names.includes("صورة إقامة الضامن"));
    assert.ok(!names.includes("الصورة الشخصية"));
    assert.equal(names.filter((name) => name.includes("إقامة الضامن")).length, 1, "never asked twice");
  });

  test("a non-Umrah package keeps its personal photo", async () => {
    const service = await prisma.service.findUnique({ where: { code: "SVC-PKG-FAMILY" } });
    const names = await publicChecklist(`services/${service.id}`);
    assert.ok(names.includes("الصورة الشخصية الحديثة"));
    assert.ok(!names.includes("إقامة الضامن"));
  });
});

describe("new Umrah packages inherit the guarantor residence", () => {
  let admin;
  before(async () => {
    admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  });

  test("an Umrah package created by the admin gets «إقامة الضامن» once; other services do not", async () => {
    const created = await admin.post("/api/services").send({ code: `TEST-WF-UMRAH-NEW-${uniqueSuffix()}`, name: "TEST-WF باقة عمرة جديدة", category: "UMRAH_PACKAGE", basePrice: 0, currency: "SAR" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const rows = await prisma.visaRequirement.findMany({ where: { serviceId: created.body.data.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "إقامة الضامن");
    assert.equal(rows[0].scope, "CASE");
    assert.equal(rows[0].active, true);
    assert.ok((await publicChecklist(`services/${created.body.data.id}`)).includes("إقامة الضامن"));

    const other = await admin.post("/api/services").send({ code: `TEST-WF-PKG-NEW-${uniqueSuffix()}`, name: "TEST-WF باقة عامة", category: "package", basePrice: 0, currency: "SAR" });
    assert.equal(other.status, 201, JSON.stringify(other.body));
    assert.equal(await prisma.visaRequirement.count({ where: { serviceId: other.body.data.id } }), 0, "a non-Umrah package is untouched");

    // Moved into Umrah later: inherits it once; editing again adds nothing.
    const moved = await admin.patch(`/api/services/${other.body.data.id}`).send({ category: "UMRAH_PACKAGE" });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    await admin.patch(`/api/services/${other.body.data.id}`).send({ name: "TEST-WF باقة عمرة معدلة" });
    assert.equal(await prisma.visaRequirement.count({ where: { serviceId: other.body.data.id, name: "إقامة الضامن" } }), 1);
  });

  test("a deliberately deactivated guarantor requirement is not re-added on edit", async () => {
    const created = await admin.post("/api/services").send({ code: `TEST-WF-UMRAH-OFF-${uniqueSuffix()}`, name: "TEST-WF باقة بلا ضامن", category: "UMRAH_PACKAGE", basePrice: 0, currency: "SAR" });
    const id = created.body.data.id;
    await prisma.visaRequirement.updateMany({ where: { serviceId: id }, data: { active: false } });
    await admin.patch(`/api/services/${id}`).send({ category: "UMRAH_PACKAGE", name: "TEST-WF تعديل" });
    assert.equal(await prisma.visaRequirement.count({ where: { serviceId: id } }), 1);
    assert.equal(await prisma.visaRequirement.count({ where: { serviceId: id, active: true } }), 0);
  });
});
