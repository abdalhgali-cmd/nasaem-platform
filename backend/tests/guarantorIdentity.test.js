// T12: the guarantor's residence requirement is recognised by its identity
// (attachmentType), not by the label text an admin may edit.
import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { ensureUmrahGuarantorRequirement } from "../src/modules/requirements/umrah-guarantor.js";
import { isGuarantorResidenceDocument } from "../../web/src/components/admin/umrah/guarantor.js";

describe("guarantor requirement identity (backend)", () => {
  test("a renamed guarantor requirement is not duplicated; a missing one is added once", async () => {
    const admin = await loginAsSuperAdmin();
    const created = await admin.post("/api/services").send({ code: `TEST-GID-${uniqueSuffix()}`, name: "TEST-GID", category: "UMRAH_PACKAGE", basePrice: 1, currency: "SAR", features: ["KIND: VISA_ONLY"] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const serviceId = created.body.data.id;
    // Package creation may already add it; start from exactly one, renamed.
    let rows = await prisma.visaRequirement.findMany({ where: { serviceId, attachmentType: "guarantor_residence" } });
    if (rows.length === 0) await ensureUmrahGuarantorRequirement(prisma, serviceId);
    rows = await prisma.visaRequirement.findMany({ where: { serviceId, attachmentType: "guarantor_residence" } });
    assert.equal(rows.length, 1);
    await prisma.visaRequirement.update({ where: { id: rows[0].id }, data: { name: "وثيقة الكفيل" } });
    assert.equal(await ensureUmrahGuarantorRequirement(prisma, serviceId), null, "found by identity despite the new name");
    assert.equal(await prisma.visaRequirement.count({ where: { serviceId, attachmentType: "guarantor_residence" } }), 1);
    // A service without one gets it added exactly once.
    await prisma.visaRequirement.deleteMany({ where: { serviceId } });
    assert.ok(await ensureUmrahGuarantorRequirement(prisma, serviceId));
    assert.equal(await ensureUmrahGuarantorRequirement(prisma, serviceId), null);
  });
});

describe("isGuarantorResidenceDocument (admin panel)", () => {
  const snapshot = [{ id: "r1", attachmentType: "guarantor_residence" }, { id: "r2", attachmentType: "passport_copy" }];
  test("identity wins over the label", () => {
    assert.equal(isGuarantorResidenceDocument({ requirementId: "r1", label: "وثيقة الكفيل" }, snapshot), true, "renamed label is still the residence");
    assert.equal(isGuarantorResidenceDocument({ requirementId: "r2", label: "إقامة الضامن" }, snapshot), false, "a passport labelled oddly is not");
  });
  test("a document with no known requirement falls back to the label", () => {
    assert.equal(isGuarantorResidenceDocument({ requirementId: null, label: "إقامة الضامن" }, snapshot), true);
    assert.equal(isGuarantorResidenceDocument({ requirementId: "gone", label: "إقامة الضامن" }, snapshot), true);
    assert.equal(isGuarantorResidenceDocument({ requirementId: null, label: "جواز" }, null), false);
  });
});
