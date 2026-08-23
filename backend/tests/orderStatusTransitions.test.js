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
  test("requires confirmed payment and approved documents", () => {
    assert.equal(canCompleteOrder({ paymentStatus: "PAID", documents: [{ status: "APPROVED" }] }), true);
    assert.equal(canCompleteOrder({ paymentStatus: "CONFIRMED", documents: [{ status: "COMPLETED" }] }), true);
  });
  test("rejects unpaid orders", () => {
    assert.equal(canCompleteOrder({ paymentStatus: "UNPAID", documents: [{ status: "APPROVED" }] }), false);
  });
  test("rejects orders with missing or pending documents", () => {
    assert.equal(canCompleteOrder({ paymentStatus: "PAID", documents: [] }), false);
    assert.equal(canCompleteOrder({ paymentStatus: "PAID", documents: [{ status: "PENDING" }] }), false);
  });
});
