import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  EXECUTION_STAGES_BY_DEPARTMENT,
  EXECUTION_STAGE_LABELS_AR,
  getAllowedExecutionStages,
  isTerminalExecutionStage,
  isValidExecutionStageForDepartment,
  TERMINAL_EXECUTION_STAGES,
} from "../src/modules/contact-requests/contact-request-execution.js";

describe("contact-request-execution (pure lookup table)", () => {
  test("getAllowedExecutionStages returns the right set for each department", () => {
    assert.deepEqual(getAllowedExecutionStages("VISAS"), [
      "AWAITING_EXECUTION",
      "IN_PROGRESS",
      "SUBMITTED_TO_AUTHORITY",
      "VISA_ISSUED",
      "VISA_REJECTED",
      "DELIVERED_TO_CUSTOMER",
      "CANCELLED",
    ]);
    assert.deepEqual(getAllowedExecutionStages("FLIGHTS"), [
      "AWAITING_EXECUTION",
      "IN_PROGRESS",
      "TICKETS_BOOKED",
      "TICKETS_ISSUED",
      "DELIVERED_TO_CUSTOMER",
      "CANCELLED",
    ]);
    assert.deepEqual(getAllowedExecutionStages("FERRY"), getAllowedExecutionStages("FLIGHTS"));
  });

  test("getAllowedExecutionStages for an unmapped (null) department returns only the generic + terminal set", () => {
    assert.deepEqual(getAllowedExecutionStages(null), ["AWAITING_EXECUTION", "IN_PROGRESS", "DELIVERED_TO_CUSTOMER", "CANCELLED"]);
  });

  test("isValidExecutionStageForDepartment rejects a stage from a different department", () => {
    assert.equal(isValidExecutionStageForDepartment("FLIGHTS", "VISA_ISSUED"), false);
    assert.equal(isValidExecutionStageForDepartment("VISAS", "TICKETS_BOOKED"), false);
  });

  test("isValidExecutionStageForDepartment accepts a generic stage for any department", () => {
    assert.equal(isValidExecutionStageForDepartment("VISAS", "IN_PROGRESS"), true);
    assert.equal(isValidExecutionStageForDepartment("HOTELS_PACKAGES", "AWAITING_EXECUTION"), true);
  });

  test("null department: department-specific stages are rejected, generic/terminal ones are accepted", () => {
    assert.equal(isValidExecutionStageForDepartment(null, "TICKETS_ISSUED"), false);
    assert.equal(isValidExecutionStageForDepartment(null, "IN_PROGRESS"), true);
    assert.equal(isValidExecutionStageForDepartment(null, "CANCELLED"), true);
  });

  test("an unknown stage string is always rejected", () => {
    assert.equal(isValidExecutionStageForDepartment("VISAS", "NOT_A_REAL_STAGE"), false);
  });

  test("isTerminalExecutionStage covers exactly the three terminal values", () => {
    for (const stage of TERMINAL_EXECUTION_STAGES) {
      assert.equal(isTerminalExecutionStage(stage), true);
    }
    assert.equal(isTerminalExecutionStage("IN_PROGRESS"), false);
    assert.equal(isTerminalExecutionStage("AWAITING_EXECUTION"), false);
  });

  test("every stage referenced by EXECUTION_STAGES_BY_DEPARTMENT has an Arabic label", () => {
    const allStages = new Set(Object.values(EXECUTION_STAGES_BY_DEPARTMENT).flat());
    for (const stage of allStages) {
      assert.ok(EXECUTION_STAGE_LABELS_AR[stage], `missing label for ${stage}`);
    }
  });
});
