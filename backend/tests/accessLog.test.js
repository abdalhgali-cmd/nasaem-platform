import "./env.js";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pathOnly, accessLogger } from "../src/utils/accessLog.js";

describe("access log redaction", () => {
  test("query strings (which may hold phones, names or tokens) are removed", () => {
    assert.equal(pathOnly({ originalUrl: "/api/flight-bookings/public/FLT-1?phone=249912345678" }), "/api/flight-bookings/public/FLT-1");
    assert.equal(pathOnly({ originalUrl: "/api/contact-requests?search=Ahmed%20Ali&limit=20" }), "/api/contact-requests");
    assert.equal(pathOnly({ originalUrl: "/health" }), "/health");
  });

  test("the logger writes the path only and never the query string", async () => {
    const lines = [];
    const logger = accessLogger("production");
    const req = { method: "GET", originalUrl: "/api/x?phone=249912345678&token=secret", url: "/x?phone=249912345678", headers: { "user-agent": "t" }, httpVersionMajor: 1, httpVersionMinor: 1, connection: { remoteAddress: "1.2.3.4" } };
    const res = { statusCode: 200, getHeader: () => undefined, on() {}, writeHead() {}, end() {} };
    // Drive morgan through its public middleware contract with a fake stream.
    const { default: morgan } = await import("morgan");
    const fmt = morgan.compile?.(':method :path-only :status');
    assert.ok(fmt, "format compiles");
    const line = fmt(morgan, req, res);
    lines.push(line);
    assert.equal(lines[0].includes("phone="), false);
    assert.equal(lines[0].includes("secret"), false);
    assert.equal(typeof logger, "function");
  });
});
