#!/usr/bin/env python3
"""Publish a verified PR APK; never execute or deploy its contents."""
import datetime
import hashlib
import json
import os
import subprocess
from pathlib import Path
from download_summary import download_link


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def api(path):
    return json.loads(command('gh', 'api', path))


def main_contains_target(repo, target_sha):
    main_sha = api(f'repos/{repo}/git/ref/heads/main')['object']['sha']
    compare = api(f'repos/{repo}/compare/{target_sha}...{main_sha}')
    return compare.get('status') in ('ahead', 'identical') and compare.get('behind_by') == 0


def provenance_is_current(repo, pr_number, target_sha, pr_head_sha, merged):
    current = api(f'repos/{repo}/pulls/{pr_number}')
    same_repo_main = (
        current.get('base', {}).get('ref') == 'main'
        and (current.get('base', {}).get('repo') or {}).get('full_name', '').lower() == repo.lower()
        and (current.get('head', {}).get('repo') or {}).get('full_name', '').lower() == repo.lower()
    )
    if not same_repo_main or current.get('head', {}).get('sha') != pr_head_sha:
        return False
    if merged:
        return (
            current.get('state') == 'closed'
            and current.get('merged') is True
            and current.get('merge_commit_sha') == target_sha
            and main_contains_target(repo, target_sha)
        )
    return current.get('state') == 'open' and not current.get('merged') and current.get('head', {}).get('sha') == target_sha


def main():
    repo, pr, sha = os.environ['REPO'], int(os.environ['PR']), os.environ['SHA']
    pr_head_sha = os.environ['PR_HEAD_SHA']
    merged = os.environ['MERGED'] == 'true'
    if not provenance_is_current(repo, pr, sha, pr_head_sha, merged):
        raise SystemExit('PR provenance changed or its target commit is no longer on main; preview not published.')
    identity = json.loads(command('aws', 'sts', 'get-caller-identity'))
    if identity['Account'] != '497172038254' or identity['Arn'] != 'arn:aws:iam::497172038254:user/aline2-android-release-ci':
        raise ValueError('Unexpected AWS release identity')
    bucket = os.environ['PRIVATE_RELEASES_BUCKET']
    if bucket != 'aline2-release-artifacts-497172038254':
        raise ValueError('Unexpected release bucket')
    key = f'android/private/expiring/pr/{pr}/{sha}/r{os.environ["GITHUB_RUN_ID"]}-a{os.environ["GITHUB_RUN_ATTEMPT"]}.apk'
    subprocess.run(['aws', 's3', 'cp', 'preview/Aline2-PR-test.apk', f's3://{bucket}/{key}', '--only-show-errors'], check=True)
    url = command('aws', 's3', 'presign', f's3://{bucket}/{key}', '--expires-in', '604800')
    if 'X-Amz-Security-Token' in url:
        raise ValueError('Session-bound download links are not permitted')
    print(f'::add-mask::{url}')
    status = command('curl', '--silent', '--show-error', '--fail', '--range', '0-0', '--max-time', '60', '--output', '/dev/null', '--write-out', '%{http_code}', url)
    if status not in ('200', '206'):
        raise ValueError('APK link failed its download check')
    if not provenance_is_current(repo, pr, sha, pr_head_sha, merged):
        raise SystemExit('PR provenance changed during publication; stale link withheld.')
    digest = hashlib.sha256(Path('preview/Aline2-PR-test.apk').read_bytes()).hexdigest()
    expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
    # No PR comments are created or edited. Developers download from this run summary.
    source_note = f"PR head: `{pr_head_sha}` · merged commit: `{sha}`" if merged else f"PR head: `{sha}`"
    summary = f"## PR test APK ready\n{download_link('Download test APK from S3', url)}\n\n"
    summary += f"{source_note} · Android versionCode: `{os.environ['VERSION']}`\n\n"
    summary += f"Expires: {expiry}. Seven-day S3 retention. SHA-256: `{digest}`\n\n"
    summary += "ARM 32/64-bit, Android 7+. Production-configured test APK; testing can affect live data. "
    summary += "Upload-key signed: cannot normally update Play-signed installations. Use a test device/profile or Play test track.\n"
    Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(summary)


if __name__ == '__main__':
    main()
