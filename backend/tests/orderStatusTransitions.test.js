import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canCompleteOrder, getRequiredDocumentTypes, isValidOrderStatusTransition } from "../src/modules/orders/orders.service.js";

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

const flightOrder = { items: [{ service: { category: "flight" } }] };
const umrahOrder = { items: [{ service: { category: "umrah" } }] };
const mixedOrder = { items: [{ service: { category: "flight" } }, { service: { category: "umrah" } }] };

describe("getRequiredDocumentTypes", () => {
  test("flight only requires a passport", () => assert.deepEqual(getRequiredDocumentTypes(flightOrder), ["PASSPORT"]));
  test("umrah requires a passport and a photo", () => assert.deepEqual(getRequiredDocumentTypes(umrahOrder), ["PASSPORT", "PHOTO"]));
  test("an order mixing services requires the union of both", () => assert.deepEqual(getRequiredDocumentTypes(mixedOrder), ["PASSPORT", "PHOTO"]));
  test("an unknown/unlisted category falls back to requiring a passport", () => assert.deepEqual(getRequiredDocumentTypes({ items: [{ service: { category: "unknown_new_category" } }] }), ["PASSPORT"]));
  test("an order with no items falls back to requiring a passport", () => assert.deepEqual(getRequiredDocumentTypes({ items: [] }), ["PASSPORT"]));
});

describe("canCompleteOrder", () => {
  test("requires confirmed payment and every required document type", () => {
    assert.equal(canCompleteOrder({ ...flightOrder, paymentStatus: "PAID", documents: [{ type: "PASSPORT" }] }), true);
    assert.equal(canCompleteOrder({ ...umrahOrder, paymentStatus: "PAID", documents: [{ type: "PASSPORT" }, { type: "PHOTO" }] }), true);
  });
  test("rejects unpaid orders", () => {
    assert.equal(canCompleteOrder({ ...flightOrder, paymentStatus: "UNPAID", documents: [{ type: "PASSPORT" }] }), false);
  });
  test("rejects orders missing a required document type", () => {
    assert.equal(canCompleteOrder({ ...flightOrder, paymentStatus: "PAID", documents: [] }), false);
    assert.equal(canCompleteOrder({ ...umrahOrder, paymentStatus: "PAID", documents: [{ type: "PASSPORT" }] }), false);
  });
});
