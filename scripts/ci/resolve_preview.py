#!/usr/bin/env python3
"""Resolve an eligible same-repository PR from a successful build run."""
import json
import os
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
    if not pr:
        print('No current eligible PR; nothing published.')
        sys.exit(0)
    permission = api(f'repos/{repo}/collaborators/{pr["user"]["login"]}/permission')['permission']
    if permission not in ('admin', 'write', 'maintain'):
        sys.exit('PR APK publication requires a repository collaborator with write access')
    artifacts = api(f'repos/{repo}/actions/runs/{run["id"]}/artifacts')['artifacts']
    matches = [a for a in artifacts if a['name'] == 'pr-preview-input' and not a['expired']]
    if len(matches) != 1 or matches[0]['size_in_bytes'] > 700 * 1024 * 1024:
        sys.exit('Missing, ambiguous or oversized preview artifact')
    with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
        for key, value in {'eligible': 'true', 'pr': pr['number'], 'sha': run['head_sha'],
                           'version': 100000 + run['run_number'], 'artifact': matches[0]['id']}.items():
            out.write(f'{key}={value}\n')
