"""Delete only the temporary signing input belonging to this workflow run."""
import json
import os
import subprocess


def cleanup(repo, run_id):
    run_id = int(run_id)
    if run_id <= 0:
        raise ValueError('Invalid workflow run ID')
    result = json.loads(subprocess.check_output(
        ['gh', 'api', f'repos/{repo}/actions/runs/{run_id}/artifacts'], text=True))
    removed = 0
    for artifact in result['artifacts']:
        if artifact['name'] != 'pr-preview-input' or artifact.get('expired'):
            continue
        # All IDs come from this run-scoped API; never search or delete older runs.
        subprocess.run(['gh', 'api', '--method', 'DELETE',
                        f'repos/{repo}/actions/artifacts/{int(artifact["id"])}'], check=True)
        removed += 1
    return removed


if __name__ == '__main__':
    print(f"Temporary inputs removed: {cleanup(os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_RUN_ID'])}")
