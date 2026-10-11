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
#                    for `release:rollback-check` (default: origin/main).
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

COUNTS_SQL='SELECT (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Customer") AS customers,
  (SELECT count(*) FROM "ContactRequest") AS requests, (SELECT count(*) FROM "Invoice") AS invoices,
  (SELECT count(*) FROM "Payment") AS payments, (SELECT coalesce(sum(amount),0) FROM "Payment") AS payment_total,
  (SELECT count(*) FROM "ContactRequestDocument") AS request_documents, (SELECT count(*) FROM "_prisma_migrations") AS migrations'
echo "== counts after restore"; psql "$TARGET_URL" -x -c "$COUNTS_SQL" | tee /tmp/drill-before.txt

echo "== migrations this candidate would apply"
( cd "$ROOT/backend" && DATABASE_URL="$PRISMA_URL" npx prisma migrate status 2>&1 | sed -n '/following migration/,$p' || true )

echo "== prisma migrate deploy (as the container does on start)"
( cd "$ROOT/backend" && DATABASE_URL="$PRISMA_URL" npx prisma migrate deploy )

echo "== counts after migrate (existing rows must be unchanged; migrations count grows)"
psql "$TARGET_URL" -x -c "$COUNTS_SQL" | tee /tmp/drill-after.txt
diff <(grep -v migrations /tmp/drill-before.txt) <(grep -v migrations /tmp/drill-after.txt) && echo "row counts and payment total unchanged"

echo "== pricing defaults (every existing item must be QUOTE)"
psql "$TARGET_URL" -Atc 'SELECT '"'"'Service'"'"' AS item, "pricingMode", count(*) FROM "Service" GROUP BY 2 UNION ALL SELECT '"'"'VisaType'"'"', "pricingMode", count(*) FROM "VisaType" GROUP BY 2' 

echo "== rollback check against ${ROLLBACK_REF:-origin/main} (read-only; exit 2 = roll-forward only)"
set +e
( cd "$ROOT/backend" && DATABASE_URL="$PRISMA_URL" npm run -s release:rollback-check -- --ref "${ROLLBACK_REF:-origin/main}" )
echo "rollback-check exit code: $?"
set -e

if [ -n "$UPLOADS" ]; then
  TMP=$(mktemp -d)
  echo "== uploads archive -> $TMP"
  tar -xzf "$UPLOADS" -C "$TMP"
  MISSING=$(psql "$TARGET_URL" -Atc 'SELECT "storagePath" FROM "ContactRequestDocument" UNION ALL SELECT "storagePath" FROM "ContactRequestDeliverable"' |
    while read -r p; do [ -z "$p" ] || [ -e "$TMP/$p" ] || [ -e "$TMP/uploads/$p" ] || echo "$p"; done | wc -l)
  echo "request files referenced in the DB but missing from the archive: $MISSING"
fi

echo "== drill database kept for inspection: $DB (drop it when done)"
