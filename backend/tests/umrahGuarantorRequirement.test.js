import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request } from "./helpers/api.js";

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
