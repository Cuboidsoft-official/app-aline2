import unittest
from pathlib import Path

import yaml
from resolve_preview import check_gate, eligible_pr, has_app_changes, latest_by_name


def check(name, conclusion="success", status="completed", app_id=15368, app_slug="github-actions", run_id=1):
    return {
        "id": run_id,
        "name": name,
        "status": status,
        "conclusion": conclusion,
        "started_at": f"2026-10-06T00:00:{run_id:02d}Z",
        "app": {"id": app_id, "slug": app_slug},
    }


class PreviewCheckGate(unittest.TestCase):
    def test_all_required_green_and_optional_skips_allow_manual_build(self):
        runs = [check("validate"), check("workflows"), check("release-android", "skipped"), check("optional-security-check", "skipped")]
        self.assertEqual(check_gate(runs), (True, "All latest PR checks are complete; required checks are green"))

    def test_missing_required_check_blocks(self):
        allowed, reason = check_gate([check("validate")])
        self.assertFalse(allowed)
        self.assertIn("workflows", reason)

    def test_pending_or_failed_check_blocks(self):
        cases = [
            [check("validate"), check("workflows", status="in_progress")],
            [check("validate", "failure"), check("workflows")],
            [check("validate"), check("workflows"), check("security-scan", "cancelled")],
        ]
        for runs in cases:
            with self.subTest(runs=runs):
                self.assertFalse(check_gate(runs)[0])

    def test_latest_rerun_supersedes_old_failure(self):
        runs = [
            check("validate", "failure", run_id=1),
            check("validate", "success", run_id=2),
            check("workflows", run_id=3),
        ]
        self.assertTrue(check_gate(runs)[0])


class PreviewEligibility(unittest.TestCase):
    def setUp(self):
        self.pr = {
            "state": "open",
            "base": {"ref": "main", "repo": {"id": 42}},
            "head": {"sha": "abc", "repo": {"id": 42}},
        }

    def test_only_open_same_repository_prs_targeting_main_are_eligible(self):
        self.assertTrue(eligible_pr(self.pr, 42))
        for edit in (
            {"state": "closed"},
            {"base": {"ref": "dev", "repo": {"id": 42}}},
            {"head": {"sha": "abc", "repo": {"id": 7}}},
            {"head": {"sha": "abc", "repo": None}},
        ):
            pr = {**self.pr, **edit}
            self.assertFalse(eligible_pr(pr, 42))

    def test_only_app_relevant_changes_offer_a_test_build(self):
        self.assertTrue(has_app_changes([{"filename": "src/screens/Profile.tsx"}]))
        self.assertTrue(has_app_changes([{"filename": "android/app/build.gradle"}]))
        self.assertTrue(has_app_changes([{"filename": "patches/react-native+camera+1.0.0.patch"}]))
        self.assertTrue(has_app_changes([{"filename": "scripts/patch-build.js"}]))
        self.assertTrue(has_app_changes([{"filename": "scripts/build-android-release.sh"}]))
        self.assertTrue(has_app_changes([{"filename": "scripts/ci/filter_android_autolinking.js"}]))
        self.assertFalse(has_app_changes([{"filename": "docs/operations/android-delivery.md"}]))
        self.assertFalse(has_app_changes([{"filename": "scripts/ci/resolve_preview.py"}]))
        self.assertFalse(has_app_changes([{"filename": ".github/workflows/android-apk.yml"}]))

    def test_preview_check_does_not_block_its_own_retry(self):
        runs = [check("validate"), check("workflows"), check("PR test APK", status="in_progress")]
        self.assertTrue(check_gate(runs)[0])


class PreviewWorkflowContract(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2]
        self.main = yaml.safe_load((self.root / ".github/workflows/android-apk.yml").read_text())
        self.preview = yaml.safe_load((self.root / ".github/workflows/android-preview-delivery.yml").read_text())
        self.ci = yaml.safe_load((self.root / ".github/workflows/ci.yml").read_text())

    def test_ci_does_not_write_lint_debt_to_the_run_summary(self):
        validate_steps = self.ci["jobs"]["validate"]["steps"]
        self.assertFalse(any(step.get("name") == "Record existing lint debt" for step in validate_steps))
        self.assertFalse(any("Lint debt" in step.get("run", "") for step in validate_steps))

    def test_manual_target_calls_preview_but_main_push_keeps_production_path(self):
        triggers = self.main.get("on", self.main.get(True))
        inputs = triggers["workflow_dispatch"]["inputs"]
        self.assertEqual(inputs["target"]["default"], "production")
        self.assertEqual(inputs["target"]["options"], ["production", "pr-test"])
        self.assertIn("pr_number", inputs)
        jobs = self.main["jobs"]
        self.assertIn("android-preview-delivery.yml", jobs["pr-test-apk"]["uses"])
        self.assertIn("inputs.target == 'pr-test'", jobs["pr-test-apk"]["if"])
        self.assertIn("inputs.target == 'production'", jobs["release-android"]["if"])
        self.assertIn("github.event_name == 'push'", jobs["release-android"]["if"])
        self.assertNotIn("pull_request", triggers)
        paths = triggers["push"]["paths"]
        self.assertNotIn("scripts/**", paths)
        self.assertIn("patches/**", paths)
        self.assertIn("scripts/build-android-release.sh", paths)
        self.assertIn("scripts/patch-*.js", paths)

    def test_reusable_preview_is_manual_request_and_shares_release_sequence(self):
        triggers = self.preview.get("on", self.preview.get(True))
        self.assertIn("workflow_call", triggers)
        self.assertIn("pr_number", triggers["workflow_call"]["inputs"])
        resolver = (self.root / "scripts/ci/resolve_preview.py").read_text()
        self.assertIn('RUN_NUMBER', resolver)
        self.assertIn('REQUIRED_CHECKS = {"validate", "workflows"}', resolver)
        self.assertNotIn("build-test-apk", resolver)

    def test_pr_build_is_a_separate_unprivileged_workflow_path(self):
        caller = self.main["jobs"]["pr-test-apk"]
        self.assertIn("android-preview-delivery.yml", caller["uses"])
        self.assertNotIn("environment", self.preview["jobs"]["build-preview"])
        self.assertEqual(self.preview["jobs"]["build-preview"]["permissions"], {"contents": "read"})
        self.assertIn("ANDROID_UPLOAD_KEYSTORE_BASE64", caller["secrets"])
        self.assertIn("RELEASE_AWS_SECRET_ACCESS_KEY", yaml.safe_dump(self.preview["jobs"]["deliver"]))
        self.assertEqual(self.preview["jobs"]["deliver"]["environment"], "production")

    def test_build_rechecks_preflight_but_does_not_repeat_tests_or_handle_release_keys(self):
        jobs = self.preview["jobs"]
        build = jobs["build-preview"]
        build_text = yaml.safe_dump(build)
        self.assertIn("actions/cache/restore@", build_text)
        self.assertIn("npm ci", build_text)
        self.assertNotIn("npm run typecheck", build_text)
        self.assertNotIn("npm test", build_text)
        self.assertIn("GEMINI_API_KEY", build_text)
        self.assertIn("ZEGO_CLOUD_APP_SIGN", build_text)
        for forbidden in ("RELEASE_AWS_SECRET_ACCESS_KEY", "ANDROID_UPLOAD_KEYSTORE_BASE64", "SMTP_PASSWORD"):
            self.assertNotIn(forbidden, build_text)
        self.assertEqual(build["permissions"], {"contents": "read"})

    def test_signing_job_uses_trusted_workflow_code_and_never_builds_pr_source(self):
        deliver = self.preview["jobs"]["deliver"]
        text = yaml.safe_dump(deliver)
        self.assertEqual(deliver["steps"][0]["with"]["ref"], "${{ github.sha }}")
        self.assertFalse(deliver["steps"][0]["with"]["persist-credentials"])
        self.assertNotIn("npm ci", text)
        self.assertNotIn("build-android-release.sh", text)

    def test_preview_produces_only_standard_apk_and_no_email(self):
        build = self.preview["jobs"]["build-preview"]
        steps = {step.get("name"): step for step in build["steps"]}
        self.assertEqual(steps["Build production-configured PR APK"]["run"], "bash scripts/build-android-release.sh apk")
        self.assertNotIn("bundleRelease", yaml.safe_dump(build))
        self.assertNotIn("apk-aab", yaml.safe_dump(build))
        self.assertNotIn("send_release_email", yaml.safe_dump(self.preview["jobs"]["deliver"]))
