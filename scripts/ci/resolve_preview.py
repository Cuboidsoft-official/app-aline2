#!/usr/bin/env python3
"""Authorize a manual test APK for a green same-repository PR targeting main."""
import json
import os
import re
import subprocess
import sys


# Must match the required status-check contexts configured on main.
REQUIRED_CHECKS = {"validate", "workflows"}
ACCEPTED_OPTIONAL_CONCLUSIONS = {"success", "skipped", "neutral"}
GENERATED_PREVIEW_CHECKS = {"PR test APK", "PR release APK"}
APP_FILES = re.compile(
    r"^(src/|android/|patches/|App\.tsx$|app\.json$|index\.js$|package.*\.json$|"
    r"(babel|metro|react-native)\.config\.js$|google-services\.json$|"
    r"\.env\.production\.example$|scripts/build-android-release\.sh$|"
    r"scripts/ci/(filter_android_autolinking|list_android_codegen_prewarm_tasks)\.js$|"
    r"scripts/patch-[^/]+\.js$)"
)


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", path], text=True))


def paginated(path):
    pages = json.loads(
        subprocess.check_output(["gh", "api", "--paginate", "--slurp", path], text=True)
    )
    return [item for page in pages for item in page.get("check_runs", [])]


def latest_by_name(check_runs):
    latest = {}
    for check in check_runs:
        # A rerun leaves older check runs attached to the same SHA. Evaluate
        # only the newest run for each check name and GitHub App.
        app = (check.get("app") or {}).get("id", "unknown")
        key = (app, check.get("name", ""))
        order = (check.get("started_at") or check.get("created_at") or "", check.get("id", 0))
        if key not in latest or order > latest[key][0]:
            latest[key] = (order, check)
    return [check for _, check in latest.values()]


def check_gate(check_runs):
    checks = latest_by_name(
        check for check in check_runs if check.get("name") not in GENERATED_PREVIEW_CHECKS
    )
    github_actions = [c for c in checks if (c.get("app") or {}).get("slug") == "github-actions"]
    by_name = {c.get("name"): c for c in github_actions}

    missing = sorted(REQUIRED_CHECKS - by_name.keys())
    if missing:
        return False, f"Required PR checks have not reported on the latest commit: {', '.join(missing)}"

    for name in REQUIRED_CHECKS:
        check = by_name[name]
        if check.get("status") != "completed" or check.get("conclusion") != "success":
            return False, f"Required PR check '{name}' is not complete and green"

    for check in checks:
        if check.get("status") != "completed":
            return False, f"PR check '{check.get('name')}' is still running"
        if check.get("conclusion") not in ACCEPTED_OPTIONAL_CONCLUSIONS:
            return False, f"PR check '{check.get('name')}' concluded {check.get('conclusion')}"

    return True, "All latest PR checks are complete; required checks are green"


def eligible_pr(pr, repo_id):
    same_repo_main = (
        pr.get("base", {}).get("ref") == "main"
        and (pr.get("head", {}).get("repo") or {}).get("id") == repo_id
        and (pr.get("base", {}).get("repo") or {}).get("id") == repo_id
    )
    is_open = pr.get("state") == "open" and not pr.get("merged")
    is_merged = pr.get("state") == "closed" and pr.get("merged") is True
    return same_repo_main and (is_open or is_merged)


def target_is_ancestor(compare):
    """GitHub compare target...trusted revision: accept only if target is an ancestor."""
    return compare.get("status") in ("ahead", "identical") and compare.get("behind_by") == 0


def has_app_changes(files):
    return any(APP_FILES.search(item.get("filename", "")) for item in files)


def main():
    repo = os.environ["REPO"]
    try:
        pr_number = int(os.environ["PR_NUMBER"])
    except (TypeError, ValueError):
        sys.exit("Enter the PR number in the workflow input")
    actor = os.environ["ACTOR"]
    run_number = int(os.environ["RUN_NUMBER"])
    workflow_sha = os.environ["GITHUB_SHA"]

    if os.environ.get("REF") != "refs/heads/main":
        sys.exit("Run this workflow from main so only trusted workflow code handles secrets")
    if not 1 <= pr_number:
        sys.exit("Enter a valid PR number")
    version = 100000 + run_number
    if version > 2_100_000_000:
        sys.exit("Generated Android versionCode exceeds the Play Store limit")

    repository = api(f"repos/{repo}")
    pr = api(f"repos/{repo}/pulls/{pr_number}")
    repo_id = repository["id"]
    if not eligible_pr(pr, repo_id):
        sys.exit("Test APKs are available only for same-repository PRs targeting main")

    permission = api(f"repos/{repo}/collaborators/{actor}/permission").get("permission")
    if permission not in ("admin", "write", "maintain"):
        sys.exit("Manually requesting a PR APK requires repository write access")

    pr_head_sha = pr["head"]["sha"]
    merged = pr.get("merged") is True
    sha = pr.get("merge_commit_sha") if merged else pr_head_sha
    if not sha:
        sys.exit("GitHub did not report the exact PR merge commit")
    if merged:
        compare = api(f"repos/{repo}/compare/{sha}...{workflow_sha}")
        if not target_is_ancestor(compare):
            sys.exit("The PR merge commit is not reachable from this trusted main workflow revision")

    # For merged PRs, validate the checks on the reviewed PR head. The APK is
    # built from its exact merge commit so merge-resolution changes are included.
    checks = paginated(f"repos/{repo}/commits/{pr_head_sha}/check-runs?per_page=100")
    green, reason = check_gate(checks)
    if not green:
        sys.exit(f"PR #{pr_number} at {sha[:7]} is not ready for a test APK: {reason}")

    files_pages = json.loads(
        subprocess.check_output(
            ["gh", "api", "--paginate", "--slurp", f"repos/{repo}/pulls/{pr_number}/files"],
            text=True,
        )
    )
    files = [item for page in files_pages for item in page]
    if not has_app_changes(files):
        sys.exit("This PR has no Android/app input changes that require a test APK")

    payload = {
        "name": "PR test APK",
        "head_sha": sha,
        "status": "in_progress",
        "details_url": f"https://github.com/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}",
    }
    with open("/tmp/preview-check.json", "w", encoding="utf-8") as out:
        json.dump(payload, out)
    check = json.loads(
        subprocess.check_output(
            ["gh", "api", "--method", "POST", f"repos/{repo}/check-runs", "--input", "/tmp/preview-check.json"],
            text=True,
        )
    )
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
        for key, value in {
            "eligible": "true",
            "pr": pr_number,
            "sha": sha,
            "pr_head_sha": pr_head_sha,
            "merged": str(merged).lower(),
            "version": version,
            "check": check["id"],
        }.items():
            out.write(f"{key}={value}\n")
    print(f"PR #{pr_number} at {sha[:7]} is ready. {reason}.")


if __name__ == "__main__":
    main()
