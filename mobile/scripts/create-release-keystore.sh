#!/usr/bin/env bash
# Creates the agency's permanent Android release keystore, ONCE, on a trusted
# machine (not in CI, not in this repository). Whoever holds this file and its
# passwords can publish updates to the app: back it up in at least two safe
# places. If it is lost, installed apps can never be updated in place again.
set -euo pipefail

OUT="${1:-nasaem-release.keystore}"
ALIAS="${2:-nasaem-release}"

if [ -e "$OUT" ]; then
  echo "$OUT already exists. Refusing to overwrite a signing key." >&2
  exit 1
fi

read -r -s -p "Keystore password (min 8 chars): " STORE_PASS; echo
read -r -s -p "Key password (can be the same): " KEY_PASS; echo

keytool -genkeypair -v -keystore "$OUT" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
  -dname "CN=Nasaem Al-Haramain Travel & Tourism, O=Nasaem Al-Haramain, L=Kassala, C=SD"

echo
echo "Certificate fingerprint (put it in the repository variable ANDROID_RELEASE_CERT_SHA256):"
keytool -list -v -keystore "$OUT" -alias "$ALIAS" -storepass "$STORE_PASS" | grep -E "SHA256:" | sed 's/.*SHA256: //; s/://g' | tr 'A-F' 'a-f'
echo
echo "Add these repository SECRETS (Settings > Secrets and variables > Actions):"
echo "  ANDROID_KEYSTORE_BASE64   = $(base64 -w0 "$OUT" | head -c 24)...   (full value: base64 -w0 $OUT)"
echo "  ANDROID_KEYSTORE_PASSWORD = the keystore password"
echo "  ANDROID_KEY_ALIAS         = $ALIAS"
echo "  ANDROID_KEY_PASSWORD      = the key password"
