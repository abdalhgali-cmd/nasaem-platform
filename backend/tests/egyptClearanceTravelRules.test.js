import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  calendarDaysUntilEntry,
  deriveEgyptCircularStatus,
} from "../src/modules/contact-request-tracking/egypt-clearance-travel.service.js";

const NOW = new Date("2026-08-31T10:00:00.000Z");

describe("Egypt clearance travel/circular rules", () => {
  test("calculates entry distance using the customer's local calendar date", () => {
    assert.equal(calendarDaysUntilEntry("2026-09-04", NOW), 4);
    assert.equal(calendarDaysUntilEntry("2026-08-31", NOW), 0);
  });

  test("does not require booking for the approval itself but flags a later NASAEM booking request", () => {
    assert.deepEqual(
      deriveEgyptCircularStatus({
        entryDate: "2026-10-15",
        bookingStatus: "NEEDS_NASAEM",
        approvalIssued: true,
        now: NOW,
      }),
      { status: "BOOKING_REQUIRED", daysUntilEntry: 45 }
    );
  });

  test("keeps travel details saved while the security approval is still pending", () => {
    assert.deepEqual(
      deriveEgyptCircularStatus({
        entryDate: "2026-09-10",
        bookingStatus: "EXISTING",
        approvalIssued: false,
        now: NOW,
      }),
      { status: "WAITING_APPROVAL", daysUntilEntry: 10 }
    );
  });

  test("blocks the normal circular path when there are fewer than three calendar days", () => {
    assert.deepEqual(
      deriveEgyptCircularStatus({
        entryDate: "2026-09-02",
        bookingStatus: "EXISTING",
        approvalIssued: true,
        now: NOW,
      }),
      { status: "TOO_LATE_FOR_NORMAL_CIRCULAR", daysUntilEntry: 2 }
    );
  });

  test("does not falsely claim exact 72-hour eligibility when only a date three days away is known", () => {
    assert.deepEqual(
      deriveEgyptCircularStatus({
        entryDate: "2026-09-03",
        bookingStatus: "EXISTING",
        approvalIssued: true,
        now: NOW,
      }),
      { status: "TIME_CONFIRMATION_REQUIRED", daysUntilEntry: 3 }
    );
  });

  test("marks four or more calendar days as safely ready for circular follow-up", () => {
    assert.deepEqual(
      deriveEgyptCircularStatus({
        entryDate: "2026-09-04",
        bookingStatus: "EXISTING",
        approvalIssued: true,
        now: NOW,
      }),
      { status: "READY_FOR_CIRCULAR", daysUntilEntry: 4 }
    );
  });

  test("rejects past travel dates", () => {
    assert.deepEqual(
      deriveEgyptCircularStatus({
        entryDate: "2026-08-30",
        bookingStatus: "EXISTING",
        approvalIssued: true,
        now: NOW,
      }),
      { status: "ENTRY_DATE_PASSED", daysUntilEntry: -1 }
    );
  });
});
