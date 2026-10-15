#!/usr/bin/env bash
# Restore drill for a release candidate, run on a REAL backup dump.
#
#   scripts/release-restore-drill.sh <dump.pgcustom> [uploads.tar.gz]
#
# It restores the dump into a NEW, LOCAL, throwaway database, records row
# counts, applies the candidate's migrations (`prisma migrate deploy`, as the
# backend container does on start), records the counts again and runs the
# read-only rollback check. Nothing is written anywhere except that new local
# database and a temporary directory for the uploads archive.
#
# Required environment:
#   DRILL_ADMIN_URL  postgres URL of a LOCAL server (localhost/127.0.0.1/::1)
#                    with rights to CREATE DATABASE. Any other host is refused.
# Optional:
#   DRILL_DB_NAME    name of the database to create (default nasaem_drill_<time>);
#                    it must not exist yet.
#   ROLLBACK_REF     git ref of the build the environment would roll back to,
#                    for `release:rollback-check` (default: origin/main). For
#                    Railway staging use the deployed commit (see the runbook).
#   DRILL_ALLOW_NO_UPLOADS=1  accept a run without an uploads archive (CI only;
#                    a real drill must pass the archive).
#   DRILL_EXPECT_ROLLBACK_EXIT  expected rollback-check exit code (default 2:
#                    the older build is refused, i.e. roll-forward only).
#
# Exit code: 0 only when every check passes (backend/src/release/drill-checks.js):
# row counts and payment total unchanged, no FIXED item or request, the
# expected rollback-check exit code, and 0 missing upload files. Anything else
# exits non-zero; the drill is then NOT a pass.
set -euo pipefail

DUMP=${1:?usage: release-restore-drill.sh <dump.pgcustom> [uploads.tar.gz]}
UPLOADS=${2:-}
: "${DRILL_ADMIN_URL:?set DRILL_ADMIN_URL to a LOCAL postgres admin URL}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DB=${DRILL_DB_NAME:-nasaem_drill_$(date +%Y%m%d%H%M%S)}

HOST=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$DRILL_ADMIN_URL")
case "$HOST" in
  localhost|127.0.0.1|::1|\[::1\]) ;;
  *) echo "Refused: DRILL_ADMIN_URL host '$HOST' is not local. The drill never writes to a remote database." >&2; exit 2 ;;
esac
[[ "$DB" =~ ^[a-z0-9_]+$ ]] || { echo "Refused: DRILL_DB_NAME must be [a-z0-9_]" >&2; exit 2; }
[ -f "$DUMP" ] || { echo "No such dump: $DUMP" >&2; exit 2; }

# psql/pg_restore take a plain URL; Prisma needs ?schema=public.
TARGET_URL=$(node -e 'const u=new URL(process.argv[1]);u.pathname="/"+process.argv[2];u.search="";console.log(u.toString())' "$DRILL_ADMIN_URL" "$DB")
PRISMA_URL="${TARGET_URL}?schema=public"

if psql "$DRILL_ADMIN_URL" -Atc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  echo "Refused: database $DB already exists." >&2; exit 2
fi
psql "$DRILL_ADMIN_URL" -qc "CREATE DATABASE \"$DB\""
echo "== restore into $DB (local)"
pg_restore --no-owner --no-acl -d "$TARGET_URL" "$DUMP"

COUNTS_SQL='SELECT json_build_object(
  '"'"'users'"'"', (SELECT count(*) FROM "User"), '"'"'customers'"'"', (SELECT count(*) FROM "Customer"),
  '"'"'requests'"'"', (SELECT count(*) FROM "ContactRequest"), '"'"'invoices'"'"', (SELECT count(*) FROM "Invoice"),
  '"'"'payments'"'"', (SELECT count(*) FROM "Payment"), '"'"'payment_total'"'"', (SELECT coalesce(sum(amount),0)::text FROM "Payment"),
  '"'"'request_documents'"'"', (SELECT count(*) FROM "ContactRequestDocument"), '"'"'migrations'"'"', (SELECT count(*) FROM "_prisma_migrations"))'
BEFORE=$(psql "$TARGET_URL" -Atc "$COUNTS_SQL")
echo "== counts after restore: $BEFORE"

echo "== migrations this candidate would apply"
( cd "$ROOT/backend" && DATABASE_URL="$PRISMA_URL" npx prisma migrate status 2>&1 | sed -n '/following migration/,$p' || true )

echo "== prisma migrate deploy (as the container does on start)"
( cd "$ROOT/backend" && DATABASE_URL="$PRISMA_URL" npx prisma migrate deploy )

AFTER=$(psql "$TARGET_URL" -Atc "$COUNTS_SQL")
echo "== counts after migrate: $AFTER"

FIXED_ITEMS=$(psql "$TARGET_URL" -Atc 'SELECT (SELECT count(*) FROM "Service" WHERE "pricingMode" = '"'"'FIXED'"'"') + (SELECT count(*) FROM "VisaType" WHERE "pricingMode" = '"'"'FIXED'"'"')')
FIXED_REQUESTS=$(psql "$TARGET_URL" -Atc 'SELECT count(*) FROM "ContactRequest" WHERE "pricingMode" = '"'"'FIXED'"'"'')
echo "== FIXED catalog items: $FIXED_ITEMS, FIXED requests: $FIXED_REQUESTS (both must be 0)"

REF=${ROLLBACK_REF:-origin/main}
EXPECTED_ROLLBACK=${DRILL_EXPECT_ROLLBACK_EXIT:-2}
echo "== rollback check against $REF (read-only; expected exit $EXPECTED_ROLLBACK)"
set +e
( cd "$ROOT/backend" && DATABASE_URL="$PRISMA_URL" npm run -s release:rollback-check -- --ref "$REF" )
ROLLBACK_EXIT=$?
set -e
echo "rollback-check exit code: $ROLLBACK_EXIT"

UPLOADS_CHECKED=false
MISSING=0
if [ -n "$UPLOADS" ]; then
  UPLOADS_CHECKED=true
  TMP=$(mktemp -d)
  echo "== uploads archive -> $TMP"
  tar -xzf "$UPLOADS" -C "$TMP"
  MISSING=$(psql "$TARGET_URL" -Atc 'SELECT "storagePath" FROM "ContactRequestDocument" UNION ALL SELECT "storagePath" FROM "ContactRequestDeliverable"' |
    while read -r p; do [ -z "$p" ] || [ -e "$TMP/$p" ] || [ -e "$TMP/uploads/$p" ] || echo "$p"; done | wc -l | tr -d ' ')
  echo "request files referenced in the DB but missing from the archive: $MISSING"
else
  echo "== uploads archive not given: files NOT checked (a real drill must pass one)"
fi

echo "== drill database kept for inspection: $DB (drop it when done)"
echo "== verdict"
( cd "$ROOT/backend" && node src/release/drill-checks.js "{\"before\":$BEFORE,\"after\":$AFTER,\"fixedCatalogItems\":$FIXED_ITEMS,\"fixedRequests\":$FIXED_REQUESTS,\"rollbackExit\":$ROLLBACK_EXIT,\"expectedRollbackExit\":$EXPECTED_ROLLBACK,\"missingFiles\":$MISSING,\"uploadsChecked\":$UPLOADS_CHECKED,\"allowNoUploads\":$([ "${DRILL_ALLOW_NO_UPLOADS:-}" = "1" ] && echo true || echo false)}" )
