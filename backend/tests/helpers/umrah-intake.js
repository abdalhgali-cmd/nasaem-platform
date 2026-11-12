import assert from "node:assert/strict";
import prisma from "../../src/config/database.js";
import { isPassportRequirement } from "../../src/modules/requirements/umrah-passport.js";
import { PDF } from "./workflow.js";

// Valid intake for tests of later workflow stages. Missing-document tests
// construct their own deliberately invalid requests.
export async function withUmrahPassports(req, serviceId, count) {
  const rows = await prisma.visaRequirement.findMany({ where: { serviceId, active: true, scope: "TRAVELER" } });
  const passport = rows.find(isPassportRequirement);
  assert.ok(passport, "Umrah has a per-traveler passport requirement");
  req = req.field("documentLabels", JSON.stringify(Array(count).fill(passport.name)))
    .field("documentRequirementIds", JSON.stringify(Array(count).fill(passport.id)))
    .field("documentTravelerIndexes", JSON.stringify(Array.from({ length: count }, (_, i) => String(i))));
  for (let i = 0; i < count; i++) req = req.attach("documents", PDF(), { filename: `passport-${i}.pdf`, contentType: "application/pdf" });
  return req;
}
