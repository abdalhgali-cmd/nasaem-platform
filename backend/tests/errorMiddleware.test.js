import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import errorMiddleware from "../src/middleware/error.middleware.js";

function buildErrorApp() {
  const app = express();
  app.get("/boom", () => {
    const error = new Error("internal filesystem path /srv/private/database");
    error.statusCode = 500;
    throw error;
  });
  app.use(errorMiddleware);
  return app;
}

describe("production error responses", () => {
  test("hides internal 5xx error messages from clients", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousConsoleError = console.error;
    process.env.NODE_ENV = "production";
    console.error = () => {};

    try {
      const response = await request(buildErrorApp()).get("/boom");
      assert.equal(response.status, 500);
      assert.equal(response.body.success, false);
      assert.equal(response.body.message, "حدث خطأ داخلي. حاول مرة أخرى لاحقًا.");
      assert.doesNotMatch(response.body.message, /internal|filesystem|database|private/i);
    } finally {
      console.error = previousConsoleError;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
