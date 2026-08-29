import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { redactSensitive } from "../src/utils/activityLog.js";

// Platform 3.0 Phase 16: ActivityLog gained oldValue/newValue columns for
// "sensitive configuration changes should record ... old value where
// safe; new value where safe" — this is the evidence that they're
// actually populated for real writes (not just present in the schema),
// and that the redaction guard genuinely strips sensitive keys before
// anything reaches the database.

describe("audit log redaction", () => {
  test("redactSensitive strips password/token/secret fields at any depth", () => {
    const input = {
      name: "Jane",
      password: "hunter2",
      passwordHash: "$2b$12$abc",
      accessToken: "eyJraWQ...",
      nested: {
        apiKey: "sk-live-123",
        cardNumber: "4111111111111111",
        cvv: "123",
        iban: "SA0000000000000000000000",
        keepMe: "still here",
      },
      list: [{ token: "tok_abc", ok: true }],
    };

    const redacted = redactSensitive(input);

    assert.equal(redacted.password, "[REDACTED]");
    assert.equal(redacted.passwordHash, "[REDACTED]");
    assert.equal(redacted.accessToken, "[REDACTED]");
    assert.equal(redacted.nested.apiKey, "[REDACTED]");
    assert.equal(redacted.nested.cardNumber, "[REDACTED]");
    assert.equal(redacted.nested.cvv, "[REDACTED]");
    assert.equal(redacted.nested.iban, "[REDACTED]");
    assert.equal(redacted.nested.keepMe, "still here");
    assert.equal(redacted.list[0].token, "[REDACTED]");
    assert.equal(redacted.list[0].ok, true);
    assert.equal(redacted.name, "Jane");
  });

  test("redactSensitive strips passport-image-byte-shaped fields", () => {
    const input = { passportImageData: "base64hugestring", passportImageBase64: "moredata", label: "front" };
    const redacted = redactSensitive(input);

    assert.equal(redacted.passportImageData, "[REDACTED]");
    assert.equal(redacted.passportImageBase64, "[REDACTED]");
    assert.equal(redacted.label, "front");
  });

  test("redactSensitive passes through null/undefined/primitives unchanged", () => {
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
    assert.equal(redactSensitive("plain string"), "plain string");
    assert.equal(redactSensitive(42), 42);
  });
});

describe("audit log old/new value capture (real writes)", () => {
  test("THEME_UPDATED logs oldValue and newValue matching the actual change", async () => {
    const admin = await loginAsSuperAdmin();

    const beforeRes = await admin.get("/api/theme");
    assert.equal(beforeRes.status, 200);
    const previousPrimary = beforeRes.body.data.primary;

    const testColor = "#123456";
    const patchRes = await admin.patch("/api/theme").send({ primary: testColor });
    assert.equal(patchRes.status, 200);

    try {
      const logsRes = await admin.get("/api/activity-logs?limit=5");
      assert.equal(logsRes.status, 200);

      const entry = logsRes.body.data.find((log) => log.action === "THEME_UPDATED");
      assert.ok(entry, "expected a THEME_UPDATED activity log entry");
      assert.equal(entry.newValue.primary, testColor);
      // oldValue may be null (no theme previously set) — either way it must
      // not equal the new value, proving it's a genuine "before" snapshot.
      assert.notEqual(entry.oldValue?.primary, testColor);
    } finally {
      await admin.patch("/api/theme").send({ primary: previousPrimary || null });
    }
  });

  test("AIRLINE_CREATED then AIRLINE_DELETED logs capture the airline both times", async () => {
    const admin = await loginAsSuperAdmin();
    const name = `Audit Test Airline ${uniqueSuffix()}`;

    const createRes = await admin.post("/api/airlines").send({ name });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const airlineId = createRes.body.data.id;

    const deleteRes = await admin.delete(`/api/airlines/${airlineId}`);
    assert.equal(deleteRes.status, 200);

    const logsRes = await admin.get("/api/activity-logs?limit=10");
    assert.equal(logsRes.status, 200);

    const createdLog = logsRes.body.data.find(
      (log) => log.action === "AIRLINE_CREATED" && log.entityId === airlineId
    );
    assert.ok(createdLog, "expected an AIRLINE_CREATED activity log entry");
    assert.equal(createdLog.newValue.name, name);
    assert.equal(createdLog.oldValue, null);

    const deletedLog = logsRes.body.data.find(
      (log) => log.action === "AIRLINE_DELETED" && log.entityId === airlineId
    );
    assert.ok(deletedLog, "expected an AIRLINE_DELETED activity log entry");
    assert.equal(deletedLog.oldValue.name, name);
    assert.equal(deletedLog.newValue, null);
  });

  // Regression test for a real bug this session's own Phase 20 CI/E2E run
  // caught: VisaType.basePrice (and any other Prisma Decimal field) comes
  // back from Prisma as a Decimal.js instance, not a plain number.
  // redactSensitive() used to walk it as a generic object, serializing its
  // internal {constructor, s, e, d} representation instead of the value —
  // which Prisma's Json column then rejected, silently failing the whole
  // activity log write (logActivity swallows errors, so nothing else
  // noticed). Confirmed reproduced against a live VisaType create before
  // being fixed.
  test("VISA_TYPE_CREATED logs a Decimal field (basePrice) as a real value, not its internal representation", async () => {
    const admin = await loginAsSuperAdmin();
    const code = `AUDIT-DECIMAL-${uniqueSuffix()}`;

    const createRes = await admin.post("/api/visa-types").send({
      code,
      name: "Audit Decimal Test",
      country: "Test Country",
      basePrice: 500,
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const visaTypeId = createRes.body.data.id;

    try {
      const logsRes = await admin.get("/api/activity-logs?limit=10");
      assert.equal(logsRes.status, 200);

      const createdLog = logsRes.body.data.find(
        (log) => log.action === "VISA_TYPE_CREATED" && log.entityId === visaTypeId
      );
      assert.ok(createdLog, "expected a VISA_TYPE_CREATED activity log entry — its absence means the write silently failed");
      assert.equal(createdLog.newValue.basePrice, "500");
      assert.equal(typeof createdLog.newValue.basePrice, "string");
    } finally {
      await admin.delete(`/api/visa-types/${visaTypeId}`);
    }
  });
});
