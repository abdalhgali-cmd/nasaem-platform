#!/usr/bin/env bash
# Read-only CORS contract of the production API. Exits 1 on any mismatch.
set -u
fail=0
say() { printf '%s\n' "$*"; }
bad() { say "FAIL: $*"; fail=1; }
header() { printf '%s' "$1" | grep -i "^$2:" | head -1 | sed -E 's/^[^:]+:[[:space:]]*//' | tr -d '\r'; }

check_allowed() {
  local origin=$1 h allow cred hdrs
  for path in /health /services/public/packages /services/public; do
    h=$(curl -sS -m 30 -o /dev/null -D - -H "Origin: $origin" "$API$path")
    allow=$(header "$h" access-control-allow-origin); cred=$(header "$h" access-control-allow-credentials)
    [ "$allow" = "$origin" ] || bad "GET $path from $origin: allow-origin is '${allow:-missing}'"
    [ "$cred" = "true" ] || bad "GET $path from $origin: allow-credentials is '${cred:-missing}'"
  done
  for spec in "POST /auth/login" "GET /auth/me" "POST /contact-requests" "POST /intake-drafts" "POST /tracking/request-code"; do
    set -- $spec
    h=$(curl -sS -m 30 -o /dev/null -D - -X OPTIONS -H "Origin: $origin" -H "Access-Control-Request-Method: $1" \
      -H "Access-Control-Request-Headers: authorization,content-type,x-requested-with" "$API$2")
    allow=$(header "$h" access-control-allow-origin); cred=$(header "$h" access-control-allow-credentials)
    hdrs=$(header "$h" access-control-allow-headers | tr 'A-Z' 'a-z')
    printf '%s' "$h" | head -1 | grep -qE " 20[04]" || bad "OPTIONS $2 from $origin: $(printf '%s' "$h" | head -1 | tr -d '\r')"
    [ "$allow" = "$origin" ] || bad "OPTIONS $2 from $origin: allow-origin is '${allow:-missing}'"
    [ "$cred" = "true" ] || bad "OPTIONS $2 from $origin: allow-credentials is '${cred:-missing}'"
    for need in authorization content-type x-requested-with; do
      case ",$hdrs," in *",$need,"*) ;; *) bad "OPTIONS $2 from $origin: allow-headers lacks $need ('$hdrs')";; esac
    done
  done
  say "ok   allowed: $origin"
}

check_denied() {
  local origin=$1 h allow
  for req in "GET /health" "OPTIONS /auth/login"; do
    set -- $req
    h=$(curl -sS -m 30 -o /dev/null -D - -X "$1" -H "Origin: $origin" -H "Access-Control-Request-Method: POST" "$API$2")
    allow=$(header "$h" access-control-allow-origin)
    [ -z "$allow" ] || bad "$1 $2 from $origin must not be allowed, got allow-origin '$allow'"
  done
  say "ok   denied:  $origin"
}

for o in $ALLOWED_ORIGINS; do check_allowed "$o"; done
for o in $DENIED_ORIGINS; do check_denied "$o"; done
[ "$fail" = 0 ] && say "CORS contract holds." || { say "CORS contract BROKEN."; exit 1; }
