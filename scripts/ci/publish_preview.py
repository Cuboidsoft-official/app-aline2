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
    digest = hashlib.sha256(Path('preview/Aline2-PR-test.apk').read_bytes()).hexdigest()
    expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
    body = f'''<!-- aline2-pr-apk -->
### PR test APK ready
[Download verified test APK from GitHub]({os.environ['ARTIFACT_URL']})

Commit: `{sha}` · Android versionCode: `{os.environ['VERSION']}`
GitHub artifact retention: seven days (approximately until {expiry}). No per-developer email setup is needed.

Release-mode test APK, ARM 32-bit + 64-bit, Android 7+. Uses production backend URLs; testing can affect live user data. Secret-dependent integrations are validated in the production build after merge.
This APK uses the upload certificate and cannot update a Play-signed install. Do not uninstall an existing app to work around a signing mismatch; use a test device or Play test track.

SHA-256: `{digest}`
'''
    Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(body)
    Path('/tmp/preview-comment.json').write_text(json.dumps({'body': body}))
    # A new comment preserves provenance; never edits a developer's comment.
    subprocess.run(['gh', 'api', '--method', 'POST', f'repos/{repo}/issues/{pr}/comments', '--input', '/tmp/preview-comment.json'], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
