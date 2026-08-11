import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { app, request, uniqueSuffix } from "./helpers/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends exactly 1 of publicContactLimiter's 5 POST /contact-requests
// (one contact request shared by both tests). Uploads go through the
// separate publicFileLimiter (30/15min), used well under budget here.
describe("contact request public uploads: bad input returns 400, not 500 (regression for issue found in a bug audit)", () => {
  let requestId;

  before(async () => {
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Upload Error Test Owner",
      phone: `097${uniqueSuffix()}`,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "جدة" },
    });
    assert.equal(createRes.status, 201);
    requestId = createRes.body.data.id;
  });

  test("a disallowed MIME type is rejected with 400", async () => {
    const res = await request(app)
      .post(`/api/contact-requests/${requestId}/passport-image`)
      .attach("images", Buffer.from("not an image"), { filename: "note.txt", contentType: "text/plain" });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("exceeding the per-field file-count limit is rejected with 400", async () => {
    let req = request(app).post(`/api/contact-requests/${requestId}/passport-image`);
    // The field's multer config caps this at 7 files — attach one more.
    for (let i = 0; i < 8; i++) {
      req = req.attach("images", IMAGE_FIXTURE);
    }
    const res = await req;

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});
