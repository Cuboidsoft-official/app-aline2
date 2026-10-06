#!/usr/bin/env python3
"""Publish a verified PR APK; never execute or deploy its contents."""
import datetime
import hashlib
import json
import os
import subprocess
from pathlib import Path


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def api(path):
    return json.loads(command('gh', 'api', path))


def main():
    repo, pr, sha = os.environ['REPO'], int(os.environ['PR']), os.environ['SHA']
    current = api(f'repos/{repo}/pulls/{pr}')
    if current['state'] != 'open' or current['head']['sha'] != sha:
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
    if current['state'] != 'open' or current['head']['sha'] != sha:
        print('PR changed during publication; stale link withheld.')
        return
    digest = hashlib.sha256(Path('preview/Aline2-PR-test.apk').read_bytes()).hexdigest()
    expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
    body = f'''<!-- aline2-pr-apk -->
### PR test APK ready
[Download APK directly from S3]({url}) · [GitHub artifact backup]({os.environ['ARTIFACT_URL']})

Commit: `{sha}` · Android versionCode: `{os.environ['VERSION']}`
S3 link and GitHub artifact retention: seven days (approximately until {expiry}). No per-developer email setup is needed.

Release-mode test APK, ARM 32-bit + 64-bit, Android 7+. Uses production backend URLs; testing can affect live user data. Uses the same mobile runtime configuration as production; integration journeys still need manual testing.
This APK uses the upload certificate and cannot update a Play-signed install. Do not uninstall an existing app to work around a signing mismatch; use a test device or Play test track.

SHA-256: `{digest}`
'''
    Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(body)
    Path('/tmp/preview-comment.json').write_text(json.dumps({'body': body}))
    # A new comment preserves provenance; never edits a developer's comment.
    subprocess.run(['gh', 'api', '--method', 'POST', f'repos/{repo}/issues/{pr}/comments', '--input', '/tmp/preview-comment.json'], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
