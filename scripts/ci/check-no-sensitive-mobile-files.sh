#!/usr/bin/env bash
set -euo pipefail

bad_files=()

while IFS= read -r path; do
  case "$path" in
    .env|.env.*)
      [[ "$path" == *.example ]] || bad_files+=("$path")
      ;;
    *.jks|*.keystore)
      [[ "$path" == "android/app/debug.keystore" ]] || bad_files+=("$path")
      ;;
    *-firebase-adminsdk-*.json|*service-account*.json)
      bad_files+=("$path")
      ;;
    release-secrets/*.env)
      bad_files+=("$path")
      ;;
  esac
done < <(git ls-files)

if ((${#bad_files[@]} > 0)); then
  printf 'Sensitive file must not be tracked by the mobile repository: %s\n' "${bad_files[@]}" >&2
  exit 1
fi

private_key_files="$(git grep -Il -E 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|"private_key"[[:space:]]*:' -- . ':!package-lock.json' || true)"
if [[ -n "$private_key_files" ]]; then
  printf 'Private key material detected in tracked files:\n%s\n' "$private_key_files" >&2
  exit 1
fi

server_secret_files="$(git grep -Il -E '^(RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|SPOTIFY_CLIENT_SECRET|JAMENDO_CLIENT_SECRET)=[^[:space:]]+' -- . ':!*.example' || true)"
if [[ -n "$server_secret_files" ]]; then
  printf 'Server-only credential assignment detected in mobile files:\n%s\n' "$server_secret_files" >&2
  exit 1
fi

echo 'Mobile repository sensitive-file policy passed.'
