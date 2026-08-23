import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canCompleteOrder, isValidOrderStatusTransition } from "../src/modules/orders/orders.service.js";

describe("isValidOrderStatusTransition", () => {
  test("allows NEW -> UNDER_REVIEW", () => assert.equal(isValidOrderStatusTransition("NEW", "UNDER_REVIEW"), true));
  test("rejects NEW -> COMPLETED", () => assert.equal(isValidOrderStatusTransition("NEW", "COMPLETED"), false));
  test("terminal statuses have no outgoing transitions", () => {
    for (const status of ["COMPLETED", "REJECTED", "CANCELLED"]) {
      for (const target of ["NEW", "UNDER_REVIEW", "PROCESSING"]) assert.equal(isValidOrderStatusTransition(status, target), false);
    }
  });
  test("APPROVED can only move to COMPLETED or CANCELLED", () => {
    assert.equal(isValidOrderStatusTransition("APPROVED", "COMPLETED"), true);
    assert.equal(isValidOrderStatusTransition("APPROVED", "CANCELLED"), true);
    assert.equal(isValidOrderStatusTransition("APPROVED", "PROCESSING"), false);
    assert.equal(isValidOrderStatusTransition("APPROVED", "NEW"), false);
  });
  test("rejects an unknown source status", () => assert.equal(isValidOrderStatusTransition("NOT_A_REAL_STATUS", "NEW"), false));
});

describe("canCompleteOrder", () => {
  test("requires confirmed payment and at least one document", () => {
    assert.equal(canCompleteOrder({ paymentStatus: "PAID", documents: [{ id: "doc-1" }] }), true);
    assert.equal(canCompleteOrder({ paymentStatus: "CONFIRMED", documents: [{ id: "doc-2" }] }), true);
  });
  test("rejects unpaid orders", () => {
    assert.equal(canCompleteOrder({ paymentStatus: "UNPAID", documents: [{ id: "doc-1" }] }), false);
  });
  test("rejects orders with no documents", () => {
    assert.equal(canCompleteOrder({ paymentStatus: "PAID", documents: [] }), false);
  });
});
