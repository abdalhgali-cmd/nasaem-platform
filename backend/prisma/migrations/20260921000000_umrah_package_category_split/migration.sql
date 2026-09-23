-- Umrah catalog correction: real Umrah products (Umrah visa only, Umrah
-- with services, group/sea/air Umrah) were seeded under the same
-- Service.category ("package") as unrelated general travel packages
-- (honeymoon, family, business), so any screen listing "Umrah packages"
-- also showed those unrelated products. listPublicPackages() already
-- accepted both "package" and "UMRAH_PACKAGE" in anticipation of this
-- split (see services.service.js); this migration is the data-only,
-- additive follow-up that actually reclassifies the three Umrah codes on
-- any database where the seed already ran before this split existed.
--
-- No schema change, no destructive rewrite: only these three known Umrah
-- product codes move category, and only when they still carry the old
-- "package" value (a database where an admin already hand-edited one of
-- these rows to something else is left alone).
UPDATE "Service"
SET "category" = 'UMRAH_PACKAGE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('SVC-UMRAH-VISA', 'SVC-UMRAH-SERVICES', 'SVC-UMRAH-GROUP')
  AND "category" = 'package';
