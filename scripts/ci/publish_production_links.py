#!/usr/bin/env python3
"""Publish approved S3 downloads on the merged PR without broken masked URLs."""
import json
import os
import subprocess
from pathlib import Path


def api(path, payload=None):
    args = ['gh', 'api', path]
    if payload is not None:
        Path('/tmp/release-download-comment.json').write_text(json.dumps(payload))
        args += ['--method', 'POST', '--input', '/tmp/release-download-comment.json']
    return json.loads(subprocess.check_output(args, text=True))


def main():
    repo, sha = os.environ['REPO'], os.environ['SHA']
    candidates = api(f'repos/{repo}/commits/{sha}/pulls')
    matches = [p for p in candidates if p.get('merged_at') and p.get('merge_commit_sha') == sha and p['base']['ref'] == 'main']
    if len(matches) != 1:
        print('No unique merged PR; download from the GitHub artifact in this run.')
        return
    body = f'''<!-- aline2-production-downloads -->
### Production Android release ready
**{os.environ['RELEASE_NAME']}** · commit `{sha}`

[Download production APK]({os.environ['APK_URL']}) · [Download Play AAB]({os.environ['AAB_URL']})
Links expire {os.environ['EXPIRES']}. New S3 files expire after seven days.
[GitHub artifact backup (30 days)]({os.environ['ARTIFACT_URL']})

Standard ARM 32/64-bit release. Play upload is manual. CI APKs use the upload certificate and cannot normally update Play-signed installations.
'''
    result = api(f'repos/{repo}/issues/{matches[0]["number"]}/comments', {'body': body})
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        out.write(f'comment_url={result["html_url"]}\n')


if __name__ == '__main__':
    main()
