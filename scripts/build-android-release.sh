#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-aab}"
CREDENTIALS_FILE="${ANDROID_UPLOAD_CREDENTIALS_FILE:-/tmp/aline2-upload-keystore-credentials.txt}"
DEFAULT_KEYSTORE_PATH="$ROOT_DIR/android/app/aline2-upload.keystore"
ENVFILE_PATH="${ENVFILE:-.env.production}"

# React Native 0.82+ always runs with the New Architecture, but a number of
# third-party Android libraries still gate their React codegen tasks behind the
# legacy `newArchEnabled` Gradle property. Export it explicitly so fresh CI
# runners generate those JNI/codegen artifacts before autolinking is frozen.
: "${ORG_GRADLE_PROJECT_newArchEnabled:=true}"
export ORG_GRADLE_PROJECT_newArchEnabled

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

GRADLE_PROPS=()

case "$MODE" in
  apk)
    TASK=assembleRelease
    GRADLE_PROPS=(
      -Paline2DisableAbiSplits=true
      -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
    )
    ;;
  apk-arm64)
    TASK=assembleRelease
    GRADLE_PROPS=(
      -PreactNativeArchitectures=arm64-v8a
    )
    ;;
  aab|bundle)
    TASK=bundleRelease
    GRADLE_PROPS=(
      -Paline2DisableAbiSplits=true
      -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
    )
    ;;
  *)
    printf 'Unknown build mode: %s (expected apk, apk-arm64, or aab)
' "$MODE" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR/android"

# Fresh CI runners can generate the app autolinking files before dependency
# codegen output exists, which silently prunes required TurboModules from the
# native appmodules library. Prime the package list first, then prewarm all
# dependency codegen tasks before generating the new-arch autolinking files.
ENVFILE="$ENVFILE_PATH" ./gradlew \
  :app:generateAutolinkingPackageList \
  --no-daemon \
  --console=plain \
  --max-workers=1

mapfile -t CODEGEN_PREWARM_TASKS < <(
  node "$ROOT_DIR/scripts/ci/list_android_codegen_prewarm_tasks.js"
)

mapfile -t AVAILABLE_CODEGEN_TASKS < <(
  ENVFILE="$ENVFILE_PATH" ./gradlew \
    tasks \
    --all \
    --console=plain \
    --no-daemon \
    --max-workers=1 |
    sed -n 's/^\([[:alnum:]_:-]*generateCodegen[[:alnum:]_:-]*\).*/\1/p'
)

declare -A AVAILABLE_CODEGEN_TASK_MAP=()
for task in "${AVAILABLE_CODEGEN_TASKS[@]}"; do
  AVAILABLE_CODEGEN_TASK_MAP[":$task"]=1
done

FILTERED_CODEGEN_PREWARM_TASKS=()
for task in "${CODEGEN_PREWARM_TASKS[@]}"; do
  if [[ -n "${AVAILABLE_CODEGEN_TASK_MAP[$task]:-}" ]]; then
    FILTERED_CODEGEN_PREWARM_TASKS+=("$task")
  fi
done

if (( ${#FILTERED_CODEGEN_PREWARM_TASKS[@]} > 0 )); then
  ENVFILE="$ENVFILE_PATH" ./gradlew \
    "${FILTERED_CODEGEN_PREWARM_TASKS[@]}" \
    --no-daemon \
    --console=plain \
    --max-workers=1
fi

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
  "${GRADLE_PROPS[@]}"
