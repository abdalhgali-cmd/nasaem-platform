import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { ensureIntakeProfile, SERVICE_INTAKE_PROFILES } from "../prisma/setup-service-intake.js";

test("intake templates preserve administrator questions and inactive aliases; repeated setup does not duplicate or change prices", async () => {
  const service = await prisma.service.create({ data: { code: `TEST-PROFILE-${uniqueSuffix()}`, name: "TEST موعد", category: "tasheel", basePrice: 777 } });
  const alias = await prisma.visaRequirement.create({ data: { serviceId: service.id, name: "المدينة المطلوبة", description: "TEST admin preserved", type: "TEXT", required: false, active: false } });
  const profile = { ...SERVICE_INTAKE_PROFILES[0], code: service.code };
  assert.equal(await ensureIntakeProfile(prisma, profile), 3);
  assert.equal(await ensureIntakeProfile(prisma, profile), 0);
  const rows = await prisma.visaRequirement.findMany({ where: { serviceId: service.id } });
  assert.equal(rows.length, 4);
  const saved = rows.find(row => row.id === alias.id);
  assert.equal(saved.description, "TEST admin preserved");
  assert.equal(saved.active, false);
  assert.equal(saved.required, false);
  const preferred = rows.find(row => row.attachmentType === "tasheel_preferred_date");
  assert.equal(preferred.required, false);
  assert.equal(preferred.type, "DATE");
  const visaKind = rows.find(row => row.attachmentType === "tasheel_visa_kind");
  assert.deepEqual(visaKind.options.map(option => option.value), ["FAMILY_VISIT", "WORK", "RESIDENCE", "OTHER"]);
  assert.equal(Number((await prisma.service.findUnique({ where: { id: service.id } })).basePrice), 777);
});

test("migration is repeatable and preserves IDs, prices, admin settings and old snapshots in isolated temporary tables", () => {
  const db = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.NODE_ENV, "test");
  assert.ok(["localhost", "127.0.0.1", "postgres"].includes(db.hostname));
  assert.ok(["nasaem_platform_test", "nasaem_egypt_ux"].includes(db.pathname.slice(1)), "isolated synthetic database required");
  const migration = readFileSync(new URL("../prisma/migrations/20261111080000_service_intake_profiles/migration.sql", import.meta.url), "utf8");
  // TEMP shadows the public tables in this psql session. No application row
  // is changed, even when the same test database holds other test fixtures.
  const setup = `
CREATE TEMP TABLE "Service" (id text PRIMARY KEY, code text UNIQUE, "basePrice" numeric);
CREATE TEMP TABLE "VisaType" (id text PRIMARY KEY, code text UNIQUE, "basePrice" numeric);
CREATE TEMP TABLE "VisaRequirement" (
 id text PRIMARY KEY, "serviceId" text, "visaTypeId" text, name text, description text, "attachmentType" text,
 type public."RequirementType", scope public."RequirementScope", required boolean, options jsonb, "sortOrder" integer,
 active boolean, "maxFiles" integer, "allowedMimeTypes" text[], "reviewRequired" boolean, "ocrEnabled" boolean,
 "createdAt" timestamp, "updatedAt" timestamp
);
CREATE TEMP TABLE old_snapshot (snapshot jsonb);
INSERT INTO "Service" VALUES ('tasheel','SVC-TASHEEL',777);
INSERT INTO "VisaType" VALUES ('work','VISA-WORK',33),('intl','VISA-INTERNATIONAL',44);
INSERT INTO "VisaRequirement" (id,"serviceId",name,description,type,scope,required,active)
 VALUES ('admin-city','tasheel','المدينة المطلوبة','admin-preserved','TEXT','CASE',false,false);
INSERT INTO "VisaRequirement" (id,"visaTypeId",name,type,scope,required,active)
 VALUES ('old-passport','work','صورة الجواز','DOCUMENT','CASE',true,true),
 ('old-photo','intl','الصورة الشخصية','DOCUMENT','CASE',true,true),
 ('contract','work','عقد العمل','DOCUMENT','CASE',true,true),
 ('number','work','رقم الجواز','TEXT','CASE',false,true);
INSERT INTO old_snapshot VALUES ('[{"id":"old-passport","scope":"CASE"}]');
`;
  const assertions = `
DO $$ BEGIN
 IF (SELECT count(*) FROM "VisaRequirement") <> (SELECT n FROM first_run_count) THEN RAISE EXCEPTION 'duplicate requirements'; END IF;
 IF (SELECT count(*) FROM "VisaRequirement" WHERE "attachmentType" IS NOT NULL) <> 5 THEN RAISE EXCEPTION 'expected five missing questions'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "VisaRequirement" WHERE id='admin-city' AND active=false AND required=false AND description='admin-preserved') THEN RAISE EXCEPTION 'admin settings changed'; END IF;
 IF (SELECT scope FROM "VisaRequirement" WHERE id='old-passport') <> 'TRAVELER' OR (SELECT scope FROM "VisaRequirement" WHERE id='old-photo') <> 'TRAVELER' THEN RAISE EXCEPTION 'passport ownership not fixed'; END IF;
 IF (SELECT scope FROM "VisaRequirement" WHERE id='contract') <> 'CASE' OR (SELECT type FROM "VisaRequirement" WHERE id='number') <> 'TEXT' THEN RAISE EXCEPTION 'unrelated requirement changed'; END IF;
 IF (SELECT "basePrice" FROM "Service" WHERE id='tasheel') <> 777 OR (SELECT sum("basePrice") FROM "VisaType") <> 77 THEN RAISE EXCEPTION 'price changed'; END IF;
 IF (SELECT snapshot FROM old_snapshot) <> '[{"id":"old-passport","scope":"CASE"}]'::jsonb THEN RAISE EXCEPTION 'old snapshot changed'; END IF;
END $$;
`;
  const psql = process.env.PSQL_PATH || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/16/bin/psql.exe" : "psql");
  const result = spawnSync(psql, ["-w", "-X", "-q", "-v", "ON_ERROR_STOP=1"], { encoding: "utf8", timeout: 60000,
    input: setup + migration + '\nCREATE TEMP TABLE first_run_count AS SELECT count(*) n FROM "VisaRequirement";\n' + migration + assertions,
    env: { ...process.env, PGHOST: db.hostname, PGPORT: db.port || "5432", PGDATABASE: db.pathname.slice(1), PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password) },
  });
  assert.equal(result.status, 0, result.stderr || String(result.error || "migration failed"));
});
