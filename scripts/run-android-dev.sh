#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if adb get-state >/dev/null 2>&1; then
  adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true
  adb reverse tcp:5000 tcp:5000 >/dev/null 2>&1 || true
fi

cd "$ROOT_DIR"
ENVFILE=.env.development npx react-native run-android "$@"
