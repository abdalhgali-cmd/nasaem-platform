import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMeasurements, bottomBandTextRatio, brightnessStats, fileProblem, laplacianVariance } from "../www/js/passport-quality.js";

const flat = (w, h, value) => new Uint8ClampedArray(w * h).fill(value);

test("a flat (featureless) image is blurry; a checkerboard is sharp", () => {
  assert.equal(laplacianVariance(flat(20, 20, 128), 20, 20), 0);
  const board = new Uint8ClampedArray(400).map((_, i) => (((i % 20) + Math.floor(i / 20)) % 2 ? 255 : 0));
  assert.ok(laplacianVariance(board, 20, 20) > 1000);
});

test("brightness and glare", () => {
  assert.deepEqual(brightnessStats(flat(10, 10, 20)), { mean: 20, whiteShare: 0 });
  assert.equal(brightnessStats(flat(10, 10, 255)).whiteShare, 1);
});

test("a dense text band at the bottom (the passport's machine-readable lines) raises the ratio", () => {
  const w = 50;
  const h = 50;
  const gray = flat(w, h, 200);
  for (let y = 42; y < 49; y += 1) for (let x = 0; x < w; x += 2) gray[y * w + x] = 0;
  gray[10 * w + 10] = 0;
  assert.ok(bottomBandTextRatio(gray, w, h) > 2);
});

test("good measurements give no warning; each problem gives its own Arabic-explained code", () => {
  const good = { width: 1600, height: 1130, mean: 140, whiteShare: 0.01, sharpness: 300, page: 2 };
  assert.deepEqual(assessMeasurements(good).warnings, []);
  assert.deepEqual(assessMeasurements({ ...good, width: 640, height: 452 }).warnings, ["LOW_RESOLUTION"]);
  assert.deepEqual(assessMeasurements({ ...good, mean: 30 }).warnings, ["TOO_DARK"]);
  assert.deepEqual(assessMeasurements({ ...good, whiteShare: 0.2 }).warnings, ["GLARE"]);
  assert.deepEqual(assessMeasurements({ ...good, sharpness: 10 }).warnings, ["BLURRY"]);
  assert.deepEqual(assessMeasurements({ ...good, width: 1600, height: 1550 }).warnings, ["CROPPED"]);
  assert.deepEqual(assessMeasurements({ ...good, page: 0.5 }).warnings, ["NOT_PASSPORT_PAGE"]);
  assert.deepEqual(assessMeasurements({ ...good, page: null }).warnings, [], "not measured is not a warning");
});

test("hard checks refuse only unsupported or oversized files", () => {
  assert.equal(fileProblem({ name: "p.jpg", type: "image/jpeg", size: 1000 }), null);
  assert.equal(fileProblem({ name: "p.pdf", type: "application/pdf", size: 1000 }), null);
  assert.match(fileProblem({ name: "p.gif", type: "image/gif", size: 1000 }), /غير مدعوم/);
  assert.match(fileProblem({ name: "p.jpg", type: "image/jpeg", size: 11 * 1024 * 1024 }), /10 ميغابايت/);
});
