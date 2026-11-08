import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { testPhone } from "./helpers/workflow.js";
import { buildUmrahPackageSnapshot, umrahObligations } from "../src/modules/umrah/umrah-packages.js";
import { evaluateUmrahDelivery, umrahTicketBooking } from "../src/modules/umrah/umrah-delivery.js";
import { WORKFLOW_INCLUDE } from "../src/modules/contact-request-workflow/workflow-lock.js";

// U-02 (docs/umrah-audit): what an Umrah request owes the customer (visa
// only, or visa + flight/sea services) is frozen when it is submitted, on
// both submission paths. Editing the package afterwards must not change it.
// A request that predates the snapshot has no such record: it is labelled
// LEGACY_CATALOG and keeps reading the live catalog (not historical fact).

const DATE = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
const PUBLISHED = "2026-11-06T00:00:00Z";

const request2 = (extra = {}) => ({
  id: "snap-1",
  serviceRef: { category: "UMRAH_PACKAGE", features: ["KIND: AIR"] },
  travelers: [{ id: "a" }, { id: "b" }],
  deliverables: [
    { id: "va", kind: "VISA", publishedAt: PUBLISHED, travelerIds: ["a"] },
    { id: "vb", kind: "VISA", publishedAt: PUBLISHED, travelerIds: ["b"] },
  ],
  ...extra,
});

describe("Umrah package snapshot (unit)", () => {
  test("snapshot is built for Umrah packages only", () => {
    const snap = buildUmrahPackageSnapshot("UMRAH_PACKAGE", "svc-1", ["KIND: SEA"], new Date("2026-11-08T00:00:00Z"));
    assert.deepEqual(snap, { kind: "SEA", includesServices: true, serviceId: "svc-1", source: "SNAPSHOT", capturedAt: "2026-11-08T00:00:00.000Z" });
    assert.equal(buildUmrahPackageSnapshot("flight", "x", ["KIND: AIR"]), null);
    assert.equal(buildUmrahPackageSnapshot("UMRAH_PACKAGE", "x", ["KIND: VISA_ONLY"]).includesServices, false);
  });

  test("a snapshot keeps services required after the catalog is edited to visa only (and the reverse)", () => {
    const air = request2({ intakeData: { umrahPackage: buildUmrahPackageSnapshot("UMRAH_PACKAGE", "s", ["KIND: AIR"]) } });
    air.serviceRef.features = ["KIND: VISA_ONLY"];
    const result = evaluateUmrahDelivery(air);
    assert.equal(result.servicesRequired, true);
    assert.equal(result.complete, false);
    assert.equal(result.obligationSource, "SNAPSHOT");
    assert.equal(umrahTicketBooking(air).mode, "AIR");

    const visaOnly = request2({ intakeData: { umrahPackage: buildUmrahPackageSnapshot("UMRAH_PACKAGE", "s", ["KIND: VISA_ONLY"]) } });
    visaOnly.serviceRef.features = ["KIND: AIR"];
    const reverse = evaluateUmrahDelivery(visaOnly);
    assert.equal(reverse.servicesRequired, false);
    assert.equal(reverse.complete, true, "a later catalog change adds no obligation after contracting");
  });

  test("a request without a snapshot is labelled legacy and follows the live catalog, never claimed as history", () => {
    const legacy = request2();
    assert.equal(umrahObligations(legacy).source, "LEGACY_CATALOG");
    assert.equal(evaluateUmrahDelivery(legacy).obligationSource, "LEGACY_CATALOG");
    assert.equal(evaluateUmrahDelivery(legacy).servicesRequired, true);
  });

  test("a malformed or inconsistent snapshot is ignored (legacy path)", () => {
    for (const bad of [{ kind: "AIR", includesServices: false, source: "SNAPSHOT" }, { kind: "BOGUS", includesServices: false, source: "SNAPSHOT" }, { kind: "AIR", includesServices: true, source: "CLIENT" }, "AIR", []]) {
      assert.equal(umrahObligations(request2({ intakeData: { umrahPackage: bad } })).source, "LEGACY_CATALOG", JSON.stringify(bad));
    }
  });
});

describe("Umrah package snapshot (both submission paths)", () => {
  let admin;

  before(async () => {
    admin = await loginAsSuperAdmin();
  });

  async function packageOf(kind) {
    const created = await admin.post("/api/services").send({
      code: `TEST-SNAP-${kind}-${uniqueSuffix()}`,
      name: `TEST-SNAP عمرة ${kind}`,
      category: "UMRAH_PACKAGE",
      basePrice: 1000,
      currency: "SAR",
      active: true,
      pricingMode: "FIXED",
      priceUnit: "PER_TRAVELER",
      features: [`KIND: ${kind}`, "INCLUDED: إصدار تأشيرة العمرة"],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.data;
  }

  const loadRequest = (id) => prisma.contactRequest.findUnique({ where: { id }, include: WORKFLOW_INCLUDE });

  async function changeKind(service, kind) {
    const patched = await admin.patch(`/api/services/${service.id}`).send({ features: [`KIND: ${kind}`, "INCLUDED: إصدار تأشيرة العمرة"] });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
  }

  test("multipart POST /contact-requests stores the snapshot; editing the package afterwards does not change the obligation", async () => {
    const service = await packageOf("AIR");
    const res = await request(app)
      .post("/api/contact-requests")
      .field("name", "TEST-SNAP مقدم")
      .field("phone", testPhone())
      .field("service", service.name)
      .field("serviceId", service.id)
      .field("message", "TEST-SNAP")
      .field("travelerCount", "2")
      .field("travelers", JSON.stringify([{ fullName: "المعتمر الأول", isPrimary: true }, { fullName: "المعتمر الثاني" }]))
      .field("acceptedTotal", "2000")
      .field("acceptedCurrency", "SAR")
      .field("guarantorPhone", "+966 50 123 4567")
      .field("preferredTravelDate", DATE);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: res.body.data.id }, select: { intakeData: true } });
    assert.equal(stored.intakeData.umrahPackage.kind, "AIR");
    assert.equal(stored.intakeData.umrahPackage.includesServices, true);
    assert.equal(stored.intakeData.umrahPackage.source, "SNAPSHOT");
    assert.equal(stored.intakeData.umrahPackage.serviceId, service.id);

    await changeKind(service, "VISA_ONLY");
    const after = await loadRequest(res.body.data.id);
    assert.equal(after.serviceRef.features.includes("KIND: VISA_ONLY"), true, "the catalog really changed");
    const delivery = evaluateUmrahDelivery(after);
    assert.equal(delivery.servicesRequired, true);
    assert.equal(delivery.obligationSource, "SNAPSHOT");
  });

  test("draft submit stores the snapshot too", async () => {
    const service = await packageOf("SEA");
    const created = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: service.id });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const token = created.body.data.token;
    const patch = await request(app)
      .patch(`/api/intake-drafts/${token}`)
      .send({ name: "TEST-SNAP draft", phone: testPhone(), travelerCount: 2, travelers: [{ fullName: "A" }, { fullName: "B" }] });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    const submitted = await request(app)
      .post(`/api/intake-drafts/${token}/submit`)
      .send({ acceptedTotal: "2000", acceptedCurrency: "SAR", guarantorPhone: "+966 50 123 4567", preferredTravelDate: DATE });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const id = submitted.body.data.id;
    const stored = await prisma.contactRequest.findUnique({ where: { id }, select: { intakeData: true } });
    assert.equal(stored.intakeData.umrahPackage.kind, "SEA");
    assert.equal(stored.intakeData.umrahPackage.includesServices, true);

    await changeKind(service, "VISA_ONLY");
    assert.equal(evaluateUmrahDelivery(await loadRequest(id)).servicesRequired, true);
  });

  test("a non-Umrah request carries no package snapshot", async () => {
    const created = await admin.post("/api/services").send({ code: `TEST-SNAP-OTHER-${uniqueSuffix()}`, name: "TEST-SNAP other", category: "qa-other", basePrice: 10, currency: "USD" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const draft = await request(app).post("/api/intake-drafts").send({ serviceKind: "package", serviceId: created.body.data.id });
    const token = draft.body.data.token;
    await request(app).patch(`/api/intake-drafts/${token}`).send({ name: "TEST-SNAP o", phone: testPhone(), travelerCount: 1, travelers: [{ fullName: "A" }] });
    const submitted = await request(app).post(`/api/intake-drafts/${token}/submit`).send({});
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const stored = await prisma.contactRequest.findUnique({ where: { id: submitted.body.data.id }, select: { intakeData: true } });
    assert.equal(stored.intakeData?.umrahPackage, undefined);
  });
});
