#!/usr/bin/env python3
"""Assert the long-term reliability properties of Android release delivery.

The delivery credential in GitHub is deliberately long-lived, because IAM user
access keys do not expire on their own and a key that had to be replaced on a
schedule would be a recurring chore with no compensating benefit. A permanent
credential is only acceptable if the two ways it can break are both handled
without a human, and this module pins that:

  * the link expiring is repaired by a workflow, not by a rebuild, and
  * the credential itself failing is detected before a release needs it.

Each test names the failure it prevents, and reads the real workflow files
rather than a copy, so the claims this repository makes about its own delivery
cannot drift from what it actually runs.
"""
import re
import unittest
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "android-apk.yml"
DELIVERY_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "android-release-delivery.yml"
ROTATION_SCRIPT = REPO_ROOT / "scripts" / "ci" / "rotate-android-release-credential.sh"

SCOPED_USER = "aline2-android-release-ci"
RECIPIENT = "cuboidsoft@gmail.com"


def step_named(text: str, name: str) -> str:
    """Return the raw YAML of one named step within a single job.

    Deliberately textual: the property under test is which strings appear inside
    a given step's own body, which a parsed representation would hide behind an
    expression tree.
    """
    lines = text.splitlines()
    start = None
    for index, line in enumerate(lines):
        if line.strip() == f"- name: {name}":
            start = index
            break
    if start is None:
        raise AssertionError(f"no step named {name!r}")

    indent = len(lines[start]) - len(lines[start].lstrip())
    body = [lines[start]]
    for line in lines[start + 1:]:
        if line.strip() and (len(line) - len(line.lstrip())) <= indent:
            break
        body.append(line)
    return "\n".join(body)


def all_steps_named(text: str, name: str) -> list:
    """Return the raw YAML of every step with the given name, in file order.

    A workflow can legitimately contain several steps with the same name in
    different jobs, and asserting only on the first would leave the rest
    unverified. That gap is not theoretical: it is how a broken guard in a
    second job survived a rewrite of the first.
    """
    lines = text.splitlines()
    results = []
    for index, line in enumerate(lines):
        if line.strip() != f"- name: {name}":
            continue
        indent = len(line) - len(line.lstrip())
        body = [line]
        for following in lines[index + 1:]:
            if following.strip() and (len(following) - len(following.lstrip())) <= indent:
                break
            body.append(following)
        results.append("\n".join(body))
    return results


class LongLivedCredentialIsScopedNotBlanket(unittest.TestCase):
    """The credential is permanent, so its blast radius is the only defence."""

    def test_no_workflow_signs_with_a_cloud_session(self):
        """A SigV4 presigned URL cannot outlive the session that signed it.

        This is the defect that shipped dead links to the client for a month:
        the OIDC session lasts one hour regardless of the requested window.
        """
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn(
                "configure-aws-credentials",
                text,
                f"{path.name} must not sign delivery links with a cloud session",
            )

    def test_no_workflow_can_mint_itself_a_cloud_identity(self):
        """`id-token: write` would let a compromised step escalate to a role.

        The deploy role it could reach can push images and run commands on the
        production instance, so this permission is worth keeping off both
        workflows.
        """
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
            self.assertNotIn(
                "id-token",
                workflow.get("permissions") or {},
                f"{path.name} must not request permission to mint an OIDC token",
            )

    def test_both_workflows_assert_the_scoped_identity_before_signing(self):
        """A secret that resolves to the wrong principal must abort the run.

        The credential is validated in one step and used in another, so the
        check is what stops a mistakenly widened policy, or a wrong secret, from
        going unnoticed until an incident.
        """
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            text = path.read_text(encoding="utf-8")
            self.assertIn(
                "get-caller-identity",
                text,
                f"{path.name} must prove which principal is signing",
            )
            self.assertIn(
                SCOPED_USER,
                text,
                f"{path.name} must pin the expected delivery principal by name",
            )

    def test_the_credential_is_never_echoed(self):
        """Secrets reach the step through `env:`, never through a command line.

        An argument is visible in the process table and in the expanded step log;
        an environment variable is masked. Asserted on both workflows because the
        redelivery path was written separately and could drift.
        """
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            text = path.read_text(encoding="utf-8")
            for step in ("Configure AWS release credentials",):
                body = step_named(text, step)
                self.assertIn("secrets.RELEASE_AWS_ACCESS_KEY_ID", body)
                self.assertIn("secrets.RELEASE_AWS_SECRET_ACCESS_KEY", body)
            # A secret reference must never appear on a `run:` line, where it
            # would be interpolated into the shell command itself.
            for line in text.splitlines():
                if "secrets.RELEASE_AWS_SECRET_ACCESS_KEY" in line:
                    self.assertNotIn(
                        "run:",
                        line,
                        "the secret must be bound through env, not a run command",
                    )


class ExpiredLinksAreRepairedWithoutARebuild(unittest.TestCase):
    """Seven-day links are only acceptable if replacing one is cheap."""

    def setUp(self):
        self.workflow = yaml.safe_load(DELIVERY_WORKFLOW.read_text(encoding="utf-8"))
        self.text = DELIVERY_WORKFLOW.read_text(encoding="utf-8")

    def test_redelivery_exists_as_a_standalone_workflow(self):
        """It must be its own workflow, not gated behind the release build.

        Re-signing takes seconds. Making it depend on a 25-minute build would
        mean an expired link still costs a rebuild, which is the outcome the
        seven-day window is supposed to avoid.
        """
        self.assertIn("redeliver", self.workflow["jobs"])

    def test_redelivery_is_never_automatic(self):
        """Only an explicit dispatch may send mail.

        If a scheduled or push-triggered path could reach the email step, a
        routine run would start mailing the client without anyone asking.
        """
        redeliver = self.workflow["jobs"]["redeliver"]
        condition = redeliver["if"]
        self.assertIn("workflow_dispatch", condition)
        self.assertIn("redeliver", condition)
        self.assertNotIn("schedule", condition)

    def test_redelivery_resolves_the_artifacts_from_the_release_record(self):
        """One folder name, not two hand-copied S3 keys.

        Requiring an operator to reconstruct two object keys is exactly the
        friction that turns 'your link expired' into 'nobody resends it'.
        """
        self.assertIn("release.json", self.text)
        self.assertIn("steps.record.outputs.apkKey", self.text)
        self.assertIn("steps.record.outputs.aabKey", self.text)

    def test_the_release_record_carries_what_redelivery_needs(self):
        """The producer and the consumer must agree on the field names.

        Asserted on the producer because a rename there would otherwise only
        surface as a redelivery failure, weeks after the release it affects.
        """
        producer = step_named(
            RELEASE_WORKFLOW.read_text(encoding="utf-8"),
            "Upload private APK and AAB and generate secure links",
        )
        for field in ("releaseName", "apkKey", "aabKey"):
            self.assertIn(
                f'"{field}"',
                producer,
                f"release.json must record {field}, which redelivery reads",
            )
        self.assertIn("release.json", producer, "the record must actually be uploaded")

    def test_the_release_prefix_input_cannot_escape_the_delivery_prefix(self):
        """A workflow input is attacker-influenced text and lands in an S3 URI.

        The credential is scoped, so this is defence in depth rather than the
        primary control, but a `../` in a dispatch input should be refused
        outright instead of being normalised somewhere surprising.
        """
        resolve = step_named(self.text, "Resolve the requested release")
        self.assertRegex(
            resolve,
            r"\*\[!0-9\]\*",
            "release_prefix must be validated as digits-only before it is used",
        )
        self.assertIn("exit 1", resolve)

    def test_redelivered_links_are_verified_before_they_are_emailed(self):
        """The same rule the build workflow follows, for the same reason.

        An unverified link is an undelivered release that reports success, which
        is how a month of dead links went unnoticed.
        """
        verify = step_named(self.text, "Re-sign and verify the delivery links")
        self.assertIn("curl", verify)
        self.assertIn("http_code", verify)
        self.assertIn("200|206", verify)
        self.assertIn("Not emailing it", verify)

        self.assertLess(
            self.text.index("- name: Re-sign and verify the delivery links"),
            self.text.index("- name: Email the fresh delivery links"),
            "links must be proven working before the email step can run",
        )

    def test_a_failed_redelivery_verification_aborts_the_job(self):
        """A check that inspects a failure but cannot act on it is decoration.

        The verification sets a status variable on failure; what matters is that
        something then acts on it. Asserted separately from the checks above,
        because deleting only the abort leaves every other assertion satisfied
        while the workflow happily emails a link it just proved is broken.
        """
        verify = step_named(self.text, "Re-sign and verify the delivery links")
        self.assertIn(
            "status=1",
            verify,
            "a non-resolving link must record a failure",
        )
        self.assertRegex(
            verify,
            r'(exit "\$\{status\}"|\[ "\$\{status\}" -eq 0 \] \|\| exit 1)',
            "the recorded failure must abort the step, not merely be noted",
        )

    def test_redelivery_refuses_a_session_bound_url(self):
        verify = step_named(self.text, "Re-sign and verify the delivery links")
        self.assertRegex(verify, r"\*X-Amz-Security-Token\*\).*exit 1")

    def test_redelivered_email_states_a_real_expiry(self):
        """A bare duration is unfalsifiable to someone reading it on day six."""
        email_step = step_named(self.text, "Email the fresh delivery links")
        self.assertIn("link_expires_at", email_step)
        self.assertIn(RECIPIENT, self.text)
        self.assertNotIn(
            "always()",
            email_step,
            "the email must not run after a failed verification",
        )


class CredentialFailureIsDetectedBeforeItIsNeeded(unittest.TestCase):
    """A permanent credential must be watched, or it fails silently."""

    def setUp(self):
        self.workflow = yaml.safe_load(DELIVERY_WORKFLOW.read_text(encoding="utf-8"))
        self.text = DELIVERY_WORKFLOW.read_text(encoding="utf-8")

    def test_a_health_check_actually_runs_on_a_schedule(self):
        """Without a cron the job only runs when someone remembers to run it.

        Which is the same as not having it.
        """
        self.assertIn(
            "schedule",
            self.workflow[True] if True in self.workflow else self.workflow["on"],
            "the delivery workflow needs a schedule trigger",
        )
        self.assertIn("health", self.workflow["jobs"])

    def test_the_health_check_proves_a_download_not_just_an_identity(self):
        """`sts get-caller-identity` passing says nothing about GetObject.

        Removing `s3:GetObject` from the delivery policy would leave identity
        checks green while every link 403s. So the check must fetch a real object
        through a real presign, and compare what came back.
        """
        probe = step_named(self.text, "Prove a signed download still works end to end")
        self.assertIn("aws s3 presign", probe)
        self.assertIn("curl", probe)
        self.assertIn("cmp -s", probe, "the fetched bytes must be compared to the stored object")
        self.assertIn("exit 1", probe)

    def test_the_health_check_alerts_rather_than_only_failing(self):
        """The whole incident was a failure nobody was told about.

        A red run in a log nobody reads is the same as no check at all, so the
        failure has to reach a human through the same channel as a release.

        The condition is asserted as a parsed value rather than as a substring,
        because `failure() && false` still contains `failure()` while alerting
        nobody.
        """
        warn = step_named(
            self.text, "Warn Cuboidsoft if the delivery credential is unusable"
        )
        condition = next(
            (
                line.split(":", 1)[1].strip()
                for line in warn.splitlines()
                if line.strip().startswith("if:")
            ),
            None,
        )
        self.assertIsNotNone(condition, "the alert step must be conditional")
        self.assertIn("failure()", condition, "it must fire on a failed probe")
        self.assertNotRegex(
            condition,
            r"\bfalse\b",
            f"the alert condition is dead code: {condition!r}",
        )
        self.assertIn(
            "steps.probe.outcome",
            condition,
            "it must be tied to the probe specifically, not to any failure in the job",
        )
        self.assertIn(RECIPIENT, warn)
        self.assertIn("send_release_email.py", warn)

    def test_a_missing_sentinel_is_informational_not_a_failure(self):
        """The sentinel only exists after the first release on this path.

        Treating its absence as a failure would make the check permanently red
        and train everyone to ignore it, which is worse than having no check.
        """
        probe = step_named(self.text, "Prove a signed download still works end to end")
        self.assertIn("informational", probe)
        self.assertIn("probed=false", probe)

    def test_the_release_workflow_writes_the_sentinel(self):
        producer = step_named(
            RELEASE_WORKFLOW.read_text(encoding="utf-8"),
            "Upload private APK and AAB and generate secure links",
        )
        self.assertIn(
            ".delivery-healthcheck.json",
            producer,
            "the health check needs an object to probe, written on each release",
        )


class RotationIsSafeAndUnattended(unittest.TestCase):
    """Rotation is rare, so it must be impossible to do half-way by accident."""

    def setUp(self):
        self.script = ROTATION_SCRIPT.read_text(encoding="utf-8")

    def test_the_secret_is_never_printed(self):
        """It is written to a 0600 file and read from there by `install`.

        Echoing it would put it in a terminal scrollback, a tmux buffer and
        possibly a session transcript.
        """
        for line in self.script.splitlines():
            if "SecretAccessKey" not in line:
                continue
            self.assertNotRegex(
                line,
                r"^\s*(echo|printf|log)\b",
                "the secret must never be echoed; it is read from the 0600 file",
            )

    def test_the_secret_never_reaches_a_command_line(self):
        """An argument is world-readable in the process table.

        Every `gh secret set` must therefore be fed on stdin. Asserted per
        occurrence and by forbidding `--body`, because piping is easy to lose to
        a single convenience flag and a one-line regex over the whole script
        misses it.
        """
        for line in self.script.splitlines():
            if "gh secret set" not in line:
                continue
            self.assertIn(
                "| gh secret set",
                line,
                f"gh secret set must be fed on stdin, not by argument: {line.strip()!r}",
            )
        self.assertNotIn(
            "--body",
            self.script,
            "--body would place the secret in the process table and in the log",
        )

    def test_the_credential_file_is_private(self):
        self.assertIn("umask 077", self.script)
        self.assertIn("chmod 600", self.script)
        self.assertIn("chmod 700", self.script)

    def test_rotation_refuses_to_exceed_two_keys(self):
        """AWS allows two per user; creating a third fails obscurely."""
        self.assertIn("live\" -ge 2", self.script)

    def test_the_new_key_is_proven_before_the_old_one_is_revoked(self):
        """The whole safety of a two-key overlap is the ordering."""
        self.assertIn("Verifying its permissions", self.script)
        self.assertLess(
            self.script.index("cmd_create()"),
            self.script.index("cmd_revoke()"),
            "creation and proof must be defined before revocation",
        )
        self.assertIn("Do not revoke the old key before step 3 passes", self.script)

    def test_revoking_the_new_key_is_refused(self):
        """The one irreversible mistake this script could otherwise enable."""
        self.assertIn("refusing to revoke", self.script)
        self.assertIn("read -r typed", self.script, "revocation must be confirmed by hand")

    def test_revocation_states_the_consequence(self):
        """Deleting a key invalidates its links immediately, not in seven days."""
        self.assertIn("already dead", self.script)


class TheChecksAreActuallyWiredIn(unittest.TestCase):
    """A test nobody runs is documentation with extra steps.

    These assertions read the real workflow file, so their only value depends on
    the delivery workflow remaining on `main` and on CI continuing to run them.
    Deleting either would leave a green pipeline protecting nothing, which is
    precisely the state this whole change exists to end.
    """

    CI_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"

    def test_the_delivery_workflow_lives_in_the_repository(self):
        """If it is deleted, its tests read a file that is not there.

        Every other test in this module resolves this path, so its absence would
        surface as a collection error rather than a clear failure. Asserting it
        directly turns "the whole module silently stopped running" into one named
        failure.
        """
        self.assertTrue(
            DELIVERY_WORKFLOW.exists(),
            f"{DELIVERY_WORKFLOW.name} must be committed, not left untracked; "
            "its redelivery and health-check jobs are the only automated repair "
            "for delivery failures",
        )
        self.assertTrue(
            ROTATION_SCRIPT.exists(),
            f"{ROTATION_SCRIPT.name} must be committed, not left untracked",
        )

    def test_ci_runs_the_delivery_contract(self):
        """Otherwise nothing fails when the contract is broken."""
        ci = self.CI_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn(
            "python3 -m unittest discover -s scripts/ci -p 'test_*.py'",
            ci,
            "CI must run the release delivery contract",
        )
        run_step = step_named(ci, "Assert release delivery contract")
        self.assertNotIn(
            "continue-on-error",
            run_step,
            "the delivery contract must be blocking",
        )

    def test_ci_runs_before_the_expensive_android_build(self):
        """A broken delivery contract should cost seconds, not half an hour."""
        ci = self.CI_WORKFLOW.read_text(encoding="utf-8")
        self.assertLess(
            ci.index("name: Assert release delivery contract"),
            ci.index("name: Set up Android SDK"),
            "the delivery contract must run before the Android toolchain is installed",
        )

    def test_ci_lints_the_workflows(self):
        """A malformed workflow does not fail; it just silently stops running."""
        ci = self.CI_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("actionlint", ci)
        self.assertIn(
            "sha256sum --check",
            ci,
            "the actionlint binary must be checksum-verified before it is unpacked",
        )
        lint_step = step_named(ci, "Lint GitHub Actions workflows")
        self.assertNotIn(
            "continue-on-error",
            lint_step,
            "workflow linting must be blocking",
        )
        self.assertIn(
            ".github/workflows/*.yml",
            lint_step,
            "every workflow must be linted, not a hand-picked subset",
        )

    def test_ci_parses_the_rotation_script(self):
        """A syntax error in the rotation script only surfaces mid-rotation."""
        ci = self.CI_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("bash -n scripts/ci/rotate-android-release-credential.sh", ci)


class BothWorkflowsShareOneDeliveryContract(unittest.TestCase):
    """Two hand-written credential blocks will drift unless pinned together."""

    def test_the_scoped_credential_step_is_identical_in_both(self):
        """Two hand-written credential blocks are the obvious place for drift.

        Every copy is compared, not just the first: there are three of them
        (release, redeliver, health) and `step_named` returns the first match in
        a file, so checking only that would leave the health job's copy
        entirely unverified.
        """
        copies = []
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            text = path.read_text(encoding="utf-8")
            found = all_steps_named(text, "Configure AWS release credentials")
            self.assertTrue(
                found, f"{path.name} must configure the delivery credential"
            )
            copies.extend(found)
        self.assertEqual(
            len(copies),
            3,
            "expected one credential block in the release workflow and two in the "
            "delivery workflow; a different count means a block was added or lost",
        )

        bodies = {self._run_body(step) for step in copies}
        self.assertEqual(
            len(bodies),
            1,
            "the credential check must be one shared body, not several copies: "
            + " | ".join(sorted(bodies)),
        )

    def test_only_the_credential_block_uses_the_identity_message(self):
        """The refusal message is unique to the identity check.

        A single careless find-and-replace once rewrote the session-token guard
        and the HTTP-status guard to say "not the scoped user", which left the
        real diagnosis invisible at exactly the moment it was needed. So every
        other guard must keep its own message.
        """
        identity_message = "not the scoped aline2-android-release-ci user"
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            for line in path.read_text(encoding="utf-8").splitlines():
                if identity_message not in line:
                    continue
                self.assertRegex(
                    line.strip(),
                    r"^\*\)\s",
                    f"{path.name}: the identity refusal must be a `case` default arm; "
                    "another guard has been overwritten with the identity message",
                )

    @staticmethod
    def _run_body(step: str) -> str:
        """Extract the executable statements of a step, ignoring prose.

        Comments are documentation and are allowed to differ between the two
        files: the delivery workflow's copy explains the same check in less
        detail because it has no build behind it. What must not differ is a
        single statement, so blank lines and comment-only lines are dropped
        before comparing.
        """
        _, marker, body = step.partition("run: |")
        if not marker:
            raise AssertionError("step has no `run: |` body")
        lines = [
            line
            for line in body.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        if not lines:
            raise AssertionError("step has an empty `run: |` body")
        pad = min(len(line) - len(line.lstrip()) for line in lines)
        return "\n".join(line[pad:] for line in lines)

    def test_both_use_the_same_recipient(self):
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            text = path.read_text(encoding="utf-8")
            self.assertIn(
                f"SMTP_TO: {RECIPIENT}",
                text,
                f"{path.name} must deliver to the agreed address",
            )

    def test_both_send_through_the_one_verified_script(self):
        """One code path means one set of guarantees, including exit-on-failure."""
        for path in (RELEASE_WORKFLOW, DELIVERY_WORKFLOW):
            text = path.read_text(encoding="utf-8")
            self.assertIn(
                "scripts/ci/send_release_email.py",
                text,
                f"{path.name} must send through the audited script",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
