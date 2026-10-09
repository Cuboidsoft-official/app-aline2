"""Redelivery republishes what a failed PR test APK run already built.

No rebuild, no new trust: the retained artifact, the signer, and the publish
script are the same ones the normal preview path uses, and the resolver only
authorizes the exact failure this workflow exists to repair.
"""
import unittest
from pathlib import Path

import yaml

import resolve_preview_redelivery


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "android-preview-redelivery.yml"
RESOLVER = ROOT / "scripts" / "ci" / "resolve_preview_redelivery.py"


def failed_source_run():
    """The shape of run 175: a failed manual Android PR Test APK dispatch."""
    return {
        "event": "workflow_dispatch",
        "path": ".github/workflows/android-apk.yml",
        "head_branch": "main",
        "status": "completed",
        "conclusion": "failure",
        "run_number": 175,
        "head_sha": "997964f9a1c4a4d0e5f6a7b8c9d0e1f2a3b4c5d6",
    }


class RedeliveryWorkflowOnlyRepublishes(unittest.TestCase):
    def setUp(self):
        self.text = WORKFLOW.read_text(encoding="utf-8")
        self.workflow = yaml.safe_load(self.text)
        self.jobs = self.workflow["jobs"]

    @staticmethod
    def steps_named(job, name):
        return {step.get("name"): step for step in job["steps"]}[name]

    def test_redelivery_is_manual_only(self):
        """A dispatch is the only trigger: nothing re-delivers on a schedule or a push."""
        triggers = self.workflow.get("on", self.workflow.get(True))
        self.assertEqual(list(triggers), ["workflow_dispatch"])
        declared = triggers["workflow_dispatch"]["inputs"]
        self.assertTrue(declared["pr_number"]["required"])
        self.assertTrue(declared["source_run_id"]["required"])

    def test_the_workflow_never_runs_a_build(self):
        """Skipping Gradle is the entire reason this workflow exists."""
        for forbidden in ("build-android-release.sh", "npm ci", "gradle", "gradlew"):
            self.assertNotIn(forbidden, self.text)
        self.assertEqual(set(self.jobs), {"resolve", "deliver"})

    def test_deliver_is_top_level_on_the_production_environment(self):
        """A job inside a called workflow never sees environment secrets — that is the failure being repaired, so redelivery's deliver must be a top-level job bound to production."""
        self.assertEqual(self.jobs["deliver"]["environment"], "production")

    def test_the_retained_artifact_is_downloaded_from_the_named_source_run(self):
        """The APK comes from the failed run's own artifact, not from a rebuild and not from whatever the newest run happens to hold."""
        download = self.steps_named(
            self.jobs["deliver"], "Download retained built APK from the source run"
        )
        self.assertEqual(download["with"]["name"], "pr-preview-input")
        self.assertEqual(
            download["with"]["run-id"], "${{ needs.resolve.outputs.source_run_id }}"
        )
        self.assertTrue(download["with"]["github-token"])

    def test_credentials_reach_the_publish_step_through_env_only(self):
        """A secret on a `run:` line is visible in the process table and the expanded log; through `env:` it is masked."""
        publish = self.steps_named(
            self.jobs["deliver"], "Publish downloads in PR and run summary"
        )
        self.assertEqual(
            publish["env"]["AWS_ACCESS_KEY_ID"],
            "${{ secrets.RELEASE_AWS_ACCESS_KEY_ID }}",
        )
        self.assertEqual(
            publish["env"]["AWS_SECRET_ACCESS_KEY"],
            "${{ secrets.RELEASE_AWS_SECRET_ACCESS_KEY }}",
        )
        for line in self.text.splitlines():
            if "secrets.RELEASE_AWS_SECRET_ACCESS_KEY" in line:
                self.assertNotIn("run:", line)

    def test_publish_receives_exactly_what_the_resolver_validated(self):
        """Publishing re-verifies provenance against the API; it must compare the same PR, merge commit, and head the resolver authorized."""
        publish = self.steps_named(
            self.jobs["deliver"], "Publish downloads in PR and run summary"
        )
        self.assertEqual(publish["env"]["PR"], "${{ needs.resolve.outputs.pr }}")
        self.assertEqual(publish["env"]["SHA"], "${{ needs.resolve.outputs.sha }}")
        self.assertEqual(
            publish["env"]["PR_HEAD_SHA"], "${{ needs.resolve.outputs.pr_head_sha }}"
        )
        self.assertEqual(
            publish["env"]["MERGED"], "${{ needs.resolve.outputs.merged }}"
        )
        self.assertEqual(publish["env"]["VERSION"], "${{ needs.resolve.outputs.version }}")

    def test_deliver_checks_out_only_trusted_tooling(self):
        """The runner signs and publishes repository code at the dispatched revision — never PR code."""
        checkout = self.jobs["deliver"]["steps"][0]
        self.assertEqual(checkout["with"]["ref"], "${{ github.sha }}")
        self.assertFalse(checkout["with"]["persist-credentials"])

    def test_deliver_never_emails(self):
        """PR test APKs are published as a run-summary link; email is release-only."""
        self.assertNotIn("send_release_email", self.text)

    def test_input_cleanup_targets_the_source_run(self):
        """The temporary input lives in the source run, not this one; without the override cleanup would look in the wrong run and silently keep the unsigned APK."""
        cleanup = self.steps_named(
            self.jobs["deliver"], "Remove delivered temporary signing input"
        )
        self.assertEqual(
            cleanup["env"]["ARTIFACT_RUN_ID"],
            "${{ needs.resolve.outputs.source_run_id }}",
        )
        self.assertTrue(cleanup["continue-on-error"])

    def test_resolve_must_pass_before_deliver_runs(self):
        """No authorization, no signing: the deliver job consumes only the resolver's outputs."""
        self.assertEqual(self.jobs["deliver"]["needs"], ["resolve"])


class RedeliveryResolverRefusesEverythingButTheKnownFailure(unittest.TestCase):
    def test_source_run_must_be_the_failed_manual_android_release_on_main(self):
        """Only this exact shape justifies a rebuild-free redelivery: a completed manual dispatch from main that failed after building."""
        run = failed_source_run()
        self.assertTrue(resolve_preview_redelivery.source_run_is_eligible(run))
        for field, wrong in (
            ("event", "pull_request"),
            ("path", ".github/workflows/ci.yml"),
            ("head_branch", "feature/x"),
            ("status", "in_progress"),
            ("conclusion", "success"),
        ):
            self.assertFalse(
                resolve_preview_redelivery.source_run_is_eligible({**run, field: wrong}),
                f"{field}={wrong!r} must not qualify as a repairable failure",
            )
        for missing in ("run_number", "head_sha"):
            self.assertFalse(
                resolve_preview_redelivery.source_run_is_eligible(
                    {key: value for key, value in run.items() if key != missing}
                ),
                f"the source run must report {missing}",
            )

    def test_only_a_live_non_empty_input_artifact_counts(self):
        """An expired or empty artifact means the build is gone, and redelivering anything else would ship an unverified file."""
        valid = {"name": "pr-preview-input", "expired": False, "size_in_bytes": 83614800}
        self.assertTrue(resolve_preview_redelivery.available_input_artifact([valid]))
        self.assertFalse(resolve_preview_redelivery.available_input_artifact([]))
        self.assertFalse(
            resolve_preview_redelivery.available_input_artifact([{**valid, "expired": True}])
        )
        self.assertFalse(
            resolve_preview_redelivery.available_input_artifact(
                [{**valid, "size_in_bytes": 0}]
            )
        )
        self.assertFalse(
            resolve_preview_redelivery.available_input_artifact(
                [{**valid, "name": "pr-release-input"}]
            )
        )

    def test_the_resolver_never_creates_a_check_run(self):
        """Redelivery must not fabricate a second PR test APK check; the retained run's record stands and this workflow reports through its own summary."""
        self.assertNotIn("--method POST", RESOLVER.read_text(encoding="utf-8"))

    def test_the_resolver_requires_trusted_main_and_write_access(self):
        """Dispatching from a branch would run attacker-editable workflow code with production credentials, so the resolver insists on main and on repository write access."""
        source = RESOLVER.read_text(encoding="utf-8")
        self.assertIn('"refs/heads/main"', source)
        self.assertIn('"admin", "write", "maintain"', source)


if __name__ == "__main__":
    unittest.main()
