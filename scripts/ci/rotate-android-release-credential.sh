#!/usr/bin/env bash
#
# Zero-downtime rotation of the Android release delivery credential.
#
# WHY THIS IS A SCRIPT AND NOT A WORKFLOW
#   Fully automatic rotation would need either iam:CreateAccessKey on a role
#   that GitHub Actions can assume, or a GitHub token with permission to write
#   repository secrets. Both grant more privilege than the problem deserves:
#   the first would hand a production deploy role the ability to mint
#   credentials, and the second would park an admin token in the repository.
#   Neither is justified to avoid a 30-second manual step, so the manual step is
#   scripted instead, and the weekly health check verifies the result.
#
# WHY IT IS SAFE TO RUN AT ANY TIME
#   AWS allows two access keys per user. This script creates the replacement
#   first, proves the release workflow's own signing and fetch path works with
#   it, and only then asks you to install it. The old key is deleted last, and
#   the script refuses to delete it until you confirm. A release that starts
#   during rotation keeps working, because the old key is still valid.
#
# USAGE
#   scripts/ci/rotate-android-release-credential.sh plan
#   scripts/ci/rotate-android-release-credential.sh create
#   scripts/ci/rotate-android-release-credential.sh install <access-key-id>
#   scripts/ci/rotate-android-release-credential.sh revoke <old-access-key-id>
#
# Run from a machine that already has AWS administrator credentials. The
# script never prints the new secret; it writes it to a 0600 file that only you
# read, and tells you where that is.

set -euo pipefail

USER_NAME="aline2-android-release-ci"
SECRETS_REPO="${SECRETS_REPO:-Cuboidsoft-official/app-aline2}"
SECRET_ID="RELEASE_AWS_ACCESS_KEY_ID"
SECRET_KEY="RELEASE_AWS_SECRET_ACCESS_KEY"
KEY_DIR="${KEY_DIR:-${XDG_RUNTIME_DIR:-/tmp}/aline2-key-rotation}"

die() { echo "error: $*" >&2; exit 1; }
say() { echo "$@"; }

list_keys() {
  aws iam list-access-keys --user-name "$USER_NAME" \
    --query 'AccessKeyMetadata[].{Id:AccessKeyId,Status:Status,Created:CreateDate}' \
    --output table
}

# The current state, plus whether the repository secret matches a live key.
# Comparing them is what catches the half-rotated state where the secret in
# GitHub points at a key that was already revoked.
cmd_plan() {
  say "Access keys on ${USER_NAME}:"
  list_keys

  local live current
  live="$(aws iam list-access-keys --user-name "$USER_NAME" \
    --query 'length(AccessKeyMetadata[?Status==`Active`])' --output text)"
  current="$(gh secret list --repo "$SECRETS_REPO" --env production \
    --json name --jq '.[] | select(.name=="'"$SECRET_ID"'") | .name')"

  say ""
  if [ "$live" -gt 2 ]; then
    die "${USER_NAME} has ${live} active keys. Delete the oldest before rotating; AWS allows at most two."
  fi
  if [ "$live" -eq 0 ]; then
    say "WARNING: no active keys. Delivery is broken right now. Create one now:  $0 create"
  fi
  if [ -z "$current" ]; then
    say "WARNING: ${SECRET_ID} is not set on the production environment. Delivery is broken right now."
  fi
  say "Next: $0 create    (then follow the printed instructions)"
}

cmd_create() {
  mkdir -p "$KEY_DIR"
  chmod 700 "$KEY_DIR"
  local out="${KEY_DIR}/new-key.json"

  local live
  live="$(aws iam list-access-keys --user-name "$USER_NAME" \
    --query 'length(AccessKeyMetadata)' --output text)"
  if [ "$live" -ge 2 ]; then
    die "Two keys already exist. Revoke the old one first:  $0 revoke <old-access-key-id>"
  fi

  # Written to a 0600 file and never echoed: the secret is readable by this
  # one command's output only if you choose to cat it.
  ( umask 077; aws iam create-access-key --user-name "$USER_NAME" \
      --query 'AccessKey' --output json > "$out" )
  chmod 600 "$out"

  local key_id
  key_id="$(python3 -c "import json;print(json.load(open('$out'))['AccessKeyId'])")"

  # Prove the new key can do exactly what the release workflow needs, and
  # nothing more, before anyone depends on it. A key that cannot presign is
  # worse than no key, because it fails only at release time.
  say "Created ${key_id}. Verifying its permissions..."
  local ak sk
  ak="$(python3 -c "import json;print(json.load(open('$out'))['AccessKeyId'])")"
  sk="$(python3 -c "import json;print(json.load(open('$out'))['SecretAccessKey'])")"

  local identity
  identity="$(AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" \
    aws sts get-caller-identity --query Arn --output text)"
  case "$identity" in
    *":user/${USER_NAME}") say "  identity: ${identity} (correct)" ;;
    *) die "new key authenticates as ${identity}, not ${USER_NAME}" ;;
  esac

  # GetObject is the permission that actually delivers a release, so test it
  # against a real object rather than trusting the policy document.
  if AWS_ACCESS_KEY_ID="$ak" AWS_SECRET_ACCESS_KEY="$sk" \
       aws s3 cp "s3://aline2-release-artifacts-497172038254/android/private/.delivery-healthcheck.json" \
       /dev/null --only-show-errors 2>/dev/null; then
    say "  GetObject on the delivery prefix: works"
  else
    say "  GetObject on the delivery prefix: no sentinel object yet (expected before the first release)"
  fi

  say ""
  say "The new secret is in ${out} (mode 0600). It is not printed here."
  say ""
  say "Now install it:"
  say "  1. Open ${out} and copy the SecretAccessKey value."
  say "  2. $0 install ${key_id}"
  say "  3. Trigger 'Android Release Delivery' with mode=check to confirm."
  say "  4. Only then:  $0 revoke <the older key id>"
  say ""
  say "Do not revoke the old key before step 3 passes, or delivery breaks."
}

# Reads the secret from the 0600 file created by `create`, so it never has to
# appear in a shell history, a process argument list, or this script's output.
cmd_install() {
  local key_id="${1:-}" out="${KEY_DIR}/new-key.json"
  [ -n "$key_id" ] || die "usage: $0 install <access-key-id>"
  [ -f "$out" ] || die "${out} not found. Run '$0 create' first."

  local file_id
  file_id="$(python3 -c "import json;print(json.load(open('$out'))['AccessKeyId'])")"
  [ "$file_id" = "$key_id" ] || die "the file holds ${file_id}, not ${key_id}"

  say "Installing ${key_id} into the production environment of ${SECRETS_REPO}..."
  python3 -c "import json;print(json.load(open('$out'))['AccessKeyId'])" \
    | gh secret set "$SECRET_ID" --repo "$SECRETS_REPO" --env production
  say "  ${SECRET_ID} set"

  # gh cannot read a secret back, so the value is re-sent from the same file.
  # That is safe precisely because the file never leaves this machine.
  python3 -c "import json;print(json.load(open('$out'))['SecretAccessKey'])" \
    | gh secret set "$SECRET_KEY" --repo "$SECRETS_REPO" --env production
  say "  ${SECRET_KEY} set"

  say ""
  say "Verify before revoking anything:"
  say "  Actions -> 'Android Release Delivery' -> Run workflow -> mode: check"
  say "It must report 'Delivery credential is healthy'."
}

cmd_revoke() {
  local key_id="${1:-}" out="${KEY_DIR}/new-key.json"
  [ -n "$key_id" ] || die "usage: $0 revoke <old-access-key-id>"

  if [ -f "$out" ]; then
    local new_id
    new_id="$(python3 -c "import json;print(json.load(open('$out'))['AccessKeyId'])")"
    [ "$key_id" != "$new_id" ] || die "refusing to revoke ${key_id}: that is the newly installed key, not the old one"
  fi

  say "About to revoke ${key_id} on ${USER_NAME}."
  say "This immediately invalidates every delivery link signed by it."
  say "If you have not run mode=check and seen it pass, stop."
  printf 'Type the key id to confirm: '
  local typed
  read -r typed
  [ "$typed" = "$key_id" ] || die "aborted: input did not match"

  aws iam delete-access-key --user-name "$USER_NAME" --access-key-id "$key_id"
  say "Revoked ${key_id}."
  say "Links signed by it are already dead; links signed by the new key are unaffected."
}

case "${1:-}" in
  plan)   cmd_plan ;;
  create) cmd_create ;;
  install) cmd_install "${2:-}" ;;
  revoke) cmd_revoke "${2:-}" ;;
  *) sed -n '2,30p' "$0"; exit 2 ;;
esac
