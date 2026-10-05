import "./env.js";
import "./helpers/ocrTestLimits.js"; // small caps: the OCR module reads them at load time

import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createGate } from "../src/utils/gate.js";
import { loginAsSuperAdmin } from "./helpers/api.js";
import { prepareImageForOcr, terminateOcrWorker } from "../src/modules/passport-ocr/passport-ocr.service.js";

// OCR memory/CPU grow with pixel count and OCR is reachable from public upload
// paths, so it must not be possible to exhaust the process with one image.
const solid = (width, height, format = "png") =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } } })[format]().toBuffer();

describe("OCR resource limits", () => {
  after(async () => {
    await terminateOcrWorker();
  });

  test("EXPLOIT: a tiny file declaring a huge canvas is rejected from its header, fast", async () => {
    const huge = await solid(3000, 2000); // 6 MP > the 4 MP test cap; a few KB on disk
    assert.ok(huge.length < 100_000, "the file itself is small — only the canvas is large");
    const started = Date.now();
    await assert.rejects(() => prepareImageForOcr(huge), (error) => error.statusCode === 400 && /too large/i.test(error.message));
    assert.ok(Date.now() - started < 2000, "rejection must not require decoding the image");
  });

  test("large photos are downscaled so the long edge never exceeds the cap, and emitted as PNG", async () => {
    const photo = await solid(2400, 1600, "jpeg"); // 3.8 MP, under the pixel cap
    const prepared = await prepareImageForOcr(photo);
    const meta = await sharp(prepared).metadata();
    assert.equal(meta.format, "png");
    assert.ok(Math.max(meta.width, meta.height) <= 1000, `got ${meta.width}x${meta.height}`);
    assert.equal(Math.round((meta.width / meta.height) * 100), Math.round((2400 / 1600) * 100), "aspect ratio preserved");
  });

  test("small images are not enlarged", async () => {
    const meta = await sharp(await prepareImageForOcr(await solid(600, 400))).metadata();
    assert.equal(meta.width, 600);
    assert.equal(meta.height, 400);
  });

  test("WebP input is converted to something the OCR engine can read", async () => {
    const meta = await sharp(await prepareImageForOcr(await solid(500, 300, "webp"))).metadata();
    assert.equal(meta.format, "png");
  });

  test("corrupt or non-image bytes are a clean 400, not a crash", async () => {
    await assert.rejects(() => prepareImageForOcr(Buffer.from("definitely not an image")), (error) => error.statusCode === 400);
    await assert.rejects(() => prepareImageForOcr(Buffer.alloc(0)), (error) => error.statusCode === 400);
  });

  test("the staff scan endpoint answers 400 for an oversize canvas", async () => {
    const admin = await loginAsSuperAdmin();
    const res = await admin.post("/api/passport-ocr/scan").attach("image", await solid(3000, 2000), "big.png");
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.message, /too large/i);
  });
});

describe("concurrency gate", () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };

  test("runs one at a time, queues a few, refuses the rest immediately", async () => {
    const gate = createGate({ concurrency: 1, maxQueue: 2, maxWaitMs: 5000 });
    const hold = deferred();
    const order = [];
    const job = (name) => gate.run(async () => { order.push(`start:${name}`); await hold.promise; order.push(`end:${name}`); return name; });

    const first = job("a");
    const second = job("b");
    const third = job("c");
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(gate.stats(), { running: 1, queued: 2 });
    await assert.rejects(() => job("d"), (error) => error.statusCode === 503, "the 4th request is refused, not queued");
    assert.deepEqual(order, ["start:a"], "only one job runs at a time");

    hold.resolve();
    assert.deepEqual(await Promise.all([first, second, third]), ["a", "b", "c"]);
    assert.deepEqual(gate.stats(), { running: 0, queued: 0 });
  });

  test("a queued request that waits too long is refused", async () => {
    const gate = createGate({ concurrency: 1, maxQueue: 1, maxWaitMs: 30 });
    const hold = deferred();
    const running = gate.run(() => hold.promise);
    await assert.rejects(() => gate.run(async () => "never"), (error) => error.statusCode === 503);
    hold.resolve();
    await running;
    assert.deepEqual(gate.stats(), { running: 0, queued: 0 });
  });

  test("a failing task releases its slot", async () => {
    const gate = createGate({ concurrency: 1, maxQueue: 1 });
    await assert.rejects(() => gate.run(async () => { throw new Error("boom"); }), /boom/);
    assert.equal(await gate.run(async () => "ok"), "ok");
  });
});
