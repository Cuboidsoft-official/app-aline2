#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-aab}"
CREDENTIALS_FILE="${ANDROID_UPLOAD_CREDENTIALS_FILE:-/tmp/aline2-upload-keystore-credentials.txt}"
DEFAULT_KEYSTORE_PATH="$ROOT_DIR/android/app/aline2-upload.keystore"
ENVFILE_PATH="${ENVFILE:-.env.production}"

if [[ -f "$CREDENTIALS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CREDENTIALS_FILE"
  set +a
fi

if [[ -z "${ANDROID_UPLOAD_STORE_FILE:-}" && -f "$DEFAULT_KEYSTORE_PATH" ]]; then
  export ANDROID_UPLOAD_STORE_FILE="$DEFAULT_KEYSTORE_PATH"
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

if [[ "${ANDROID_UPLOAD_STORE_FILE}" != /* && -f "$ROOT_DIR/$ANDROID_UPLOAD_STORE_FILE" ]]; then
  export ANDROID_UPLOAD_STORE_FILE="$ROOT_DIR/$ANDROID_UPLOAD_STORE_FILE"
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

# RN 0.84 + Gradle 9 can validate library codegen inputs before the producing task
# runs when `clean` and release packaging are requested together. Prewarming the
# affected library in a separate invocation keeps the schema in place and avoids
# false-negative validation failures from node_modules libraries.
ENVFILE="$ENVFILE_PATH" ./gradlew \
  :react-native-color-matrix-image-filters:generateCodegenSchemaFromJavaScript \
  :react-native-color-matrix-image-filters:generateCodegenArtifactsFromSchema \
  --no-daemon \
  --console=plain \
  --max-workers=1

ENVFILE="$ENVFILE_PATH" ./gradlew \
  :app:generateAutolinkingNewArchitectureFiles \
  --no-daemon \
  --console=plain \
  --max-workers=1

node "$ROOT_DIR/scripts/ci/filter_android_autolinking.js"

ENVFILE="$ENVFILE_PATH" ./gradlew \
  "$TASK" \
  --no-daemon \
  --console=plain \
  --max-workers=1 \
  -x generateAutolinkingNewArchitectureFiles \
  -Paline2DisableAbiSplits=true \
  -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
