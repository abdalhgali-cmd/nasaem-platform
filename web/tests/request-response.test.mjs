import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/request-response.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { readRequestReference, uncertainRequestMessage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const json = (body, status = 201) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("accepts the reference returned by the public request controller", async () => {
  assert.equal(await readRequestReference(json({ success: true, data: { id: "REQ-001" } })), "REQ-001");
});

test("never confirms a request without a valid reference", async () => {
  for (const body of [{ success: true }, { success: true, data: { id: " " } }, { data: { id: 42 } }, { success: false, data: { id: "REQ-001" } }]) {
    await assert.rejects(readRequestReference(json(body)), { message: uncertainRequestMessage });
  }
});

test("malformed success and proxy HTML guide the customer to tracking", async () => {
  for (const status of [200, 502]) {
    await assert.rejects(readRequestReference(new Response("<html>gateway error</html>", { status })), { message: uncertainRequestMessage });
  }
});

test("validation errors are actionable and do not expose internal messages", async () => {
  await assert.rejects(readRequestReference(json({ message: "Validation failed", errors: { fieldErrors: { email: ["Invalid email"] } } }, 400)), /البريد الإلكتروني/);
  await assert.rejects(readRequestReference(json({ message: "internal details" }, 422)), /راجع البيانات/);
});

test("rate limiting asks the customer to wait", async () => {
  await assert.rejects(readRequestReference(json({}, 429)), /انتظر قليلًا/);
});
