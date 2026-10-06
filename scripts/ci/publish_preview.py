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


def main():
    repo, pr, sha = os.environ['REPO'], int(os.environ['PR']), os.environ['SHA']
    current = api(f'repos/{repo}/pulls/{pr}')
    if current['state'] != 'open' or current['head']['sha'] != sha or 'build-test-apk' not in [label['name'] for label in current.get('labels', [])]:
        print('PR was merged or updated; obsolete preview not published.')
        return
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
    current = api(f'repos/{repo}/pulls/{pr}')
    if current['state'] != 'open' or current['head']['sha'] != sha or 'build-test-apk' not in [label['name'] for label in current.get('labels', [])]:
        print('PR changed during publication; stale link withheld.')
        return
    digest = hashlib.sha256(Path('preview/Aline2-PR-test.apk').read_bytes()).hexdigest()
    expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
    # No PR comments are created or edited. Developers download from this run summary.
    summary = f"## PR test APK ready\n{download_link('Download test APK from S3', url)}\n\n"
    summary += f"Commit: `{sha}` · Android versionCode: `{os.environ['VERSION']}`\n\n"
    summary += f"Expires: {expiry}. Seven-day S3 retention. SHA-256: `{digest}`\n\n"
    summary += "ARM 32/64-bit, Android 7+. Production-configured test APK; testing can affect live data. "
    summary += "Upload-key signed: cannot normally update Play-signed installations. Use a test device/profile or Play test track.\n"
    Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(summary)


if __name__ == '__main__':
    main()
