#!/usr/bin/env bash
# Usage: verify-release-cert.sh <expected-sha256> [<actual-sha256>]
#
# With one argument: checks that ANDROID_RELEASE_CERT_SHA256 is set and is a
# SHA-256 certificate fingerprint (64 hex digits; colons and case are
# ignored), and that it is not the public QA debug certificate. Prints the
# normalized fingerprint.
# With two arguments: additionally fails unless the built artifact's
# certificate equals the expected one.
# Exit status is non-zero on any failure; the release workflow stops there.
set -euo pipefail

DEBUG_CERT_SHA256="cd7447b277c7d1dbefcac2aa4751993bca3027afdec8d9bfb7a644ad9464fc72"

normalize() {
  printf '%s' "$1" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]'
}

expected="$(normalize "${1:-}")"
if [ -z "$expected" ]; then
  echo "::error::ANDROID_RELEASE_CERT_SHA256 is not set. It is required: set it to the SHA-256 fingerprint of the agency release certificate (see docs/ANDROID-RELEASE.md)." >&2
  exit 1
fi
if ! printf '%s' "$expected" | grep -Eq '^[0-9a-f]{64}$'; then
  echo "::error::ANDROID_RELEASE_CERT_SHA256 is not a SHA-256 fingerprint (64 hex digits)." >&2
  exit 1
fi
if [ "$expected" = "$DEBUG_CERT_SHA256" ]; then
  echo "::error::ANDROID_RELEASE_CERT_SHA256 is the public QA debug certificate; a release must use the agency key." >&2
  exit 1
fi

if [ "$#" -ge 2 ]; then
  actual="$(normalize "$2")"
  if [ -z "$actual" ]; then
    echo "::error::Could not read the signing certificate of the built artifact." >&2
    exit 1
  fi
  if [ "$actual" = "$DEBUG_CERT_SHA256" ]; then
    echo "::error::Signed with the public QA debug key." >&2
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "::error::Certificate $actual differs from ANDROID_RELEASE_CERT_SHA256 ($expected): this build could not update installed apps." >&2
    exit 1
  fi
fi

echo "$expected"
