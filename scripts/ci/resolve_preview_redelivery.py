#!/usr/bin/env python3
"""Authorize redelivery of a previously built PR APK without rebuilding it."""
import json
import os
import subprocess
import sys

from resolve_preview import check_gate, eligible_pr, has_app_changes, paginated, target_is_ancestor


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", path], text=True))


def source_run_is_eligible(run):
    return (
        run.get("event") == "workflow_dispatch"
        and run.get("path") == ".github/workflows/android-apk.yml"
        and run.get("head_branch") == "main"
        and run.get("status") == "completed"
        and run.get("conclusion") == "failure"
        and isinstance(run.get("run_number"), int)
        and isinstance(run.get("head_sha"), str)
    )


def available_input_artifact(artifacts):
    return any(
        item.get("name") == "pr-preview-input"
        and not item.get("expired")
        and item.get("size_in_bytes", 0) > 0
        for item in artifacts
    )


def main():
    repo = os.environ["REPO"]
    try:
        pr_number = int(os.environ["PR_NUMBER"])
        source_run_id = int(os.environ["SOURCE_RUN_ID"])
    except (TypeError, ValueError):
        sys.exit("Enter valid PR and source run numbers")
    actor = os.environ["ACTOR"]
    workflow_sha = os.environ["GITHUB_SHA"]

    if os.environ.get("REF") != "refs/heads/main":
        sys.exit("Redelivery must run from trusted main")

    repository = api(f"repos/{repo}")
    pr = api(f"repos/{repo}/pulls/{pr_number}")
    repo_id = repository["id"]
    if not eligible_pr(pr, repo_id) or pr.get("merged") is not True:
        sys.exit("Redelivery requires a merged same-repository PR targeting main")

    permission = api(f"repos/{repo}/collaborators/{actor}/permission").get("permission")
    if permission not in ("admin", "write", "maintain"):
        sys.exit("Redelivery requires repository write access")

    pr_head_sha = pr["head"]["sha"]
    merge_sha = pr.get("merge_commit_sha")
    if not merge_sha:
        sys.exit("GitHub did not report the PR merge commit")
    if not target_is_ancestor(api(f"repos/{repo}/compare/{merge_sha}...{workflow_sha}")):
        sys.exit("The PR merge commit is not reachable from this trusted main revision")

    checks = paginated(f"repos/{repo}/commits/{pr_head_sha}/check-runs?per_page=100")
    green, reason = check_gate(checks)
    if not green:
        sys.exit(f"PR #{pr_number} checks are no longer green: {reason}")
    file_pages = json.loads(subprocess.check_output(
        ["gh", "api", "--paginate", "--slurp", f"repos/{repo}/pulls/{pr_number}/files"], text=True
    ))
    if not has_app_changes([file for page in file_pages for file in page]):
        sys.exit("The PR has no Android/app inputs")

    source_run = api(f"repos/{repo}/actions/runs/{source_run_id}")
    if not source_run_is_eligible(source_run):
        sys.exit("Source run must be a failed manual Android Release workflow on main")
    if not target_is_ancestor(api(f"repos/{repo}/compare/{source_run['head_sha']}...{workflow_sha}")):
        sys.exit("Source workflow revision is not an ancestor of trusted main")

    jobs = api(f"repos/{repo}/actions/runs/{source_run_id}/jobs?per_page=100").get("jobs", [])
    resolve_job = next((job for job in jobs if job.get("name") == "pr-test-apk / resolve"), None)
    build_job = next((job for job in jobs if job.get("name") == "pr-test-apk / build-preview"), None)
    deliver_job = next((job for job in jobs if job.get("name") == "pr-test-apk / deliver"), None)
    if not resolve_job or resolve_job.get("conclusion") != "success":
        sys.exit("Source run did not pass PR provenance validation")
    if not build_job or build_job.get("conclusion") != "success":
        sys.exit("Source run does not contain a successful APK build")
    if not deliver_job or deliver_job.get("conclusion") != "failure":
        sys.exit("Source run did not fail in its delivery job")

    # Tie the retained artifact to this exact PR and merge SHA using the trusted
    # resolver's own log line. Do not trust a caller-supplied artifact alone.
    resolver_log = subprocess.check_output(
        ["gh", "run", "view", str(source_run_id), "--log", "--job", str(resolve_job["id"])], text=True
    )
    if f"PR #{pr_number} at {merge_sha[:7]} is ready." not in resolver_log:
        sys.exit("Source run did not authorize this exact PR merge commit")

    artifacts = api(f"repos/{repo}/actions/runs/{source_run_id}/artifacts").get("artifacts", [])
    if not available_input_artifact(artifacts):
        sys.exit("The original PR build artifact is missing or expired")

    version = 100000 + source_run["run_number"]
    if version > 2_100_000_000:
        sys.exit("Source APK versionCode exceeds the Play Store limit")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        for key, value in {
            "pr": pr_number,
            "sha": merge_sha,
            "pr_head_sha": pr_head_sha,
            "merged": str(pr.get("merged")).lower(),
            "version": version,
            "source_run_id": source_run_id,
        }.items():
            out.write(f"{key}={value}\n")
    print(f"Validated retained APK for PR #{pr_number} at {merge_sha[:7]}; Gradle will not run. {reason}.")


if __name__ == "__main__":
    main()
