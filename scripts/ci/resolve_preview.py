#!/usr/bin/env python3
"""Resolve an eligible same-repository PR from a successful build run."""
import json
import os
import re
import subprocess
import sys


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def eligible(run, prs, repo_id):
    if (run.get('event') != 'pull_request' or run.get('conclusion') != 'success'
            or run.get('path') != '.github/workflows/android-apk.yml'
            or (run.get('head_repository') or {}).get('id') != repo_id):
        return None
    for pr in prs:
        if (pr['state'] == 'open' and pr['base']['ref'] == 'main'
                and pr['head']['sha'] == run['head_sha']
                and (pr['head'].get('repo') or {}).get('id') == repo_id
                and (pr['base'].get('repo') or {}).get('id') == repo_id):
            return pr
    return None


if __name__ == '__main__':
    repo = os.environ['REPO']
    run = api(f'repos/{repo}/actions/runs/{int(os.environ["RUN_ID"])}')
    repository = api(f'repos/{repo}')
    prs = api(f'repos/{repo}/commits/{run["head_sha"]}/pulls')
    pr = eligible(run, prs, repository['id'])
    if not pr or 'build-test-apk' not in [label['name'] for label in pr.get('labels', [])]:
        print('No current eligible PR; nothing published.')
        sys.exit(0)
    permission = api(f'repos/{repo}/collaborators/{pr["user"]["login"]}/permission')['permission']
    if permission not in ('admin', 'write', 'maintain'):
        sys.exit('PR APK publication requires a repository collaborator with write access')
    files = json.loads(subprocess.check_output(['gh', 'api', '--paginate', '--slurp',
                                               f'repos/{repo}/pulls/{pr["number"]}/files'], text=True))
    pattern = re.compile(r'^(src/|android/|scripts/|\.github/workflows/|App\.tsx$|app\.json$|index\.js$|package.*\.json$|.*config\.js$|google-services\.json$|\.env\.production\.example$)')
    build = any(pattern.search(f['filename']) for page in files for f in page)
    payload = {'name': 'PR release APK', 'head_sha': run['head_sha'],
               'status': 'in_progress' if build else 'completed',
               'details_url': f'https://github.com/{repo}/actions/runs/{os.environ["GITHUB_RUN_ID"]}'}
    if not build:
        payload['conclusion'] = 'success'
    with open('/tmp/preview-check.json', 'w') as out:
        json.dump(payload, out)
    check = json.loads(subprocess.check_output(['gh', 'api', '--method', 'POST',
                                               f'repos/{repo}/check-runs', '--input', '/tmp/preview-check.json'], text=True))
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        for key, value in {'eligible': 'true' if build else 'false', 'pr': pr['number'], 'sha': run['head_sha'],
                           'version': 100000 + run['run_number'], 'check': check['id']}.items():
            out.write(f'{key}={value}\n')
