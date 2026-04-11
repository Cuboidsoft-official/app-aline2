#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-aab}"
CREDENTIALS_FILE="${ANDROID_UPLOAD_CREDENTIALS_FILE:-/tmp/aline2-upload-keystore-credentials.txt}"

if [[ -f "$CREDENTIALS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CREDENTIALS_FILE"
  set +a
fi

missing=()
for var in ANDROID_UPLOAD_STORE_FILE ANDROID_UPLOAD_STORE_PASSWORD ANDROID_UPLOAD_KEY_ALIAS ANDROID_UPLOAD_KEY_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing Android release signing variables: %s
' "${missing[*]}" >&2
  printf 'Set them in the environment or provide %s before building release artifacts.
' "$CREDENTIALS_FILE" >&2
  exit 1
fi

if [[ ! -f "$ANDROID_UPLOAD_STORE_FILE" ]]; then
  printf 'Android upload keystore not found at %s
' "$ANDROID_UPLOAD_STORE_FILE" >&2
  exit 1
fi

case "$MODE" in
  apk) TASK=assembleRelease ;;
  aab|bundle) TASK=bundleRelease ;;
  *)
    printf 'Unknown build mode: %s (expected apk or aab)
' "$MODE" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR/android"
ENVFILE=.env.production ./gradlew clean "$TASK" --no-daemon --console=plain --max-workers=1 -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
