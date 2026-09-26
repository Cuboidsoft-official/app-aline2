#!/usr/bin/env python3
"""Assert the properties that the 2026-09-24 Android release email violated.

Every release email between 2026-08-31 and 2026-09-26 carried two S3 links that
were dead before the recipient could use them. The build was correct, the upload
was correct, and the email step exited 0, so nothing in the pipeline objected.
The cause was mechanical: `aws s3 presign` was run with the one-hour GitHub OIDC
session, and a SigV4 presigned URL cannot outlive the session that signed it, no
matter what `--expires-in` says. The email body nonetheless promised seven days.

These tests read the real workflow file rather than a copy of it, so the claims
this repository makes about its own delivery cannot drift away from what it
actually runs. Each test names the failure it is there to prevent.
"""
import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "android-apk.yml"
EMAIL_SCRIPT = REPO_ROOT / "scripts" / "ci" / "send_release_email.py"

# The single production recipient. Asserted because the delivery address is
# hardcoded in the workflow rather than read from configuration, which is the
# only reason it is testable at all.
RECIPIENT = "cuboidsoft@gmail.com"

# 604800 seconds is seven days, and it is the value that was already there when
# the links were dying after an hour. Asserting the number alone would have
# passed against the broken workflow, so the tests below assert what signs the
# link as well.
SEVEN_DAYS_SECONDS = "604800"


def workflow_text() -> str:
    return WORKFLOW.read_text(encoding="utf-8")


class ReleaseDeliverySigning(unittest.TestCase):
    """The link must be signed by something that outlives seven days."""

    def test_no_oidc_session_signs_the_delivery_links(self):
        """The defect: a presign made with a one-hour OIDC session.

        `aws-actions/configure-aws-credentials` without `role-duration-seconds`
        yields a one-hour session. The URL embeds that session, so it returns
        ExpiredToken at the end of it however large `--expires-in` is.
        """
        text = workflow_text()
        self.assertNotIn(
            "configure-aws-credentials",
            text,
            "the release delivery step must not sign links with a cloud session; "
            "a SigV4 presigned URL cannot outlive the session that signed it",
        )

    def test_workflow_does_not_request_the_ability_to_mint_itself_a_cloud_identity(self):
        """`id-token: write` existed only to feed the OIDC step that is now gone.

        Leaving it in place would keep the workflow able to obtain a cloud
        identity for no reason, which is a privilege with no remaining purpose.
        """
        import yaml

        workflow = yaml.safe_load(workflow_text())
        permissions = workflow.get("permissions") or {}
        self.assertNotIn(
            "id-token",
            permissions,
            "no step consumes an OIDC token any more, so the workflow must not "
            "request permission to mint one",
        )

    def test_delivery_links_are_signed_with_the_scoped_release_credential(self):
        """Both the identity check and the presign must use the scoped key.

        Asserted on the real step bodies rather than on the presence of a secret
        name, because a secret that is validated in one step and then not passed
        to the step that actually signs is exactly the kind of drift that leaves
        a green build emitting dead links.
        """
        text = workflow_text()

        presign_step = self._step_named(text, "Upload private APK and AAB and generate secure links")
        self.assertIn("RELEASE_AWS_ACCESS_KEY_ID", presign_step)
        self.assertIn("RELEASE_AWS_SECRET_ACCESS_KEY", presign_step)
        self.assertIn("aws s3 presign", presign_step)

        identity_step = self._step_named(text, "Configure AWS release credentials")
        self.assertIn("RELEASE_AWS_ACCESS_KEY_ID", identity_step)
        self.assertIn("RELEASE_AWS_SECRET_ACCESS_KEY", identity_step)
        # The credential must be proven to be the scoped one before it is
        # trusted with a signature, so a mistakenly widened policy is caught in
        # the same run rather than discovered during an incident.
        self.assertIn("get-caller-identity", identity_step)
        self.assertIn("aline2-android-release-ci", identity_step)

    def test_a_session_bound_url_is_refused_before_it_can_be_emailed(self):
        """Belt and braces: detect the failure mode, not just avoid it.

        If a future change reintroduces session credentials, the presign step
        must fail rather than emit a URL that carries X-Amz-Security-Token. The
        marker is what distinguishes a session-bound URL from a standalone one.
        """
        presign_step = self._step_named(
            workflow_text(), "Upload private APK and AAB and generate secure links"
        )
        self.assertIn(
            "X-Amz-Security-Token",
            presign_step,
            "the presign step must reject any URL carrying a session token",
        )
        # The guard and the abort sit on one `case` arm, so the assertion is that
        # both appear in the same arm rather than anywhere in the step.
        self.assertRegex(
            presign_step,
            r"\*X-Amz-Security-Token\*\).*exit 1",
            "detecting a session-bound URL must fail the step, not merely warn",
        )

    def test_presign_keeps_the_seven_day_window(self):
        """The promise in the email and the window in the presign must agree."""
        presign_step = self._step_named(
            workflow_text(), "Upload private APK and AAB and generate secure links"
        )
        self.assertIn(
            f"--expires-in {SEVEN_DAYS_SECONDS}",
            presign_step,
            "the delivered link must still be signed for the full seven days it advertises",
        )

    @staticmethod
    def _step_named(text: str, name: str) -> str:
        """Return the raw YAML of one named step.

        Deliberately textual: the property under test is which secret strings
        appear inside a given step's own body, which a parsed representation
        would obscure behind the expression tree.
        """
        lines = text.splitlines()
        start = None
        for index, line in enumerate(lines):
            if line.strip() == f"- name: {name}":
                start = index
                break
        if start is None:
            raise AssertionError(f"workflow has no step named {name!r}")

        indent = len(lines[start]) - len(lines[start].lstrip())
        body = [lines[start]]
        for line in lines[start + 1:]:
            if line.strip() and (len(line) - len(line.lstrip())) <= indent:
                break
            body.append(line)
        return "\n".join(body)


class ReleaseDeliveryIsVerifiedBeforeSending(unittest.TestCase):
    """A green step that emits a broken link is worse than a red one.

    The 2026-09-24 email went out because every step succeeded. Nothing in the
    pipeline ever asked whether the links it produced actually worked, so a
    completely broken delivery was indistinguishable from a good one.
    """

    def test_links_are_fetched_before_the_email_step_runs(self):
        text = workflow_text()
        verify_index = text.index("- name: Verify delivery links resolve before emailing")
        email_index = text.index("- name: Email private APK and AAB delivery notice")
        self.assertLess(
            verify_index,
            email_index,
            "the links must be proven reachable before the email step can run",
        )

    def test_verification_actually_fails_the_job(self):
        """A check that cannot go red is documentation, not a check."""
        verify_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Verify delivery links resolve before emailing"
        )
        self.assertIn("curl", verify_step, "the links must be fetched, not assumed")
        self.assertIn("http_code", verify_step, "the response status must be inspected")
        self.assertIn(
            "Not emailing a link that does not work",
            verify_step,
            "a link that does not resolve must abort the delivery with a diagnosable error",
        )
        self.assertRegex(
            verify_step,
            r"exit \"\$\{status\}\"",
            "a failed verification must set a non-zero exit so the job goes red",
        )

    def test_verification_accepts_a_partial_response(self):
        """S3 honours Range and answers 206; treating that as failure would
        disable the check on the first run."""
        verify_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Verify delivery links resolve before emailing"
        )
        self.assertRegex(
            verify_step,
            r"200\|206",
            "both a full 200 and a range 206 are successful deliveries",
        )

    def test_the_email_step_cannot_run_when_verification_failed(self):
        """GitHub skips later steps once one fails, but only while they lack an
        `always()`-style condition. If someone adds one, this test fails."""
        email_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Email private APK and AAB delivery notice"
        )
        self.assertNotIn(
            "always()",
            email_step,
            "the email step must not be forced to run after a failed check",
        )
        self.assertNotIn(
            "continue-on-error",
            email_step,
            "a failed delivery must not be downgraded to a warning",
        )


class ReleaseEmailStatesSomethingTrue(unittest.TestCase):
    """The email is the only artefact the recipient ever sees."""

    def test_recipient_is_the_intended_address(self):
        text = workflow_text()
        self.assertIn(f"SMTP_TO: {RECIPIENT}", text)

    def test_body_reports_a_real_expiry_instead_of_a_bare_duration(self):
        """'Seven days' is unfalsifiable for someone reading the email on day
        six. An absolute timestamp can be checked."""
        email_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Email private APK and AAB delivery notice"
        )
        self.assertIn(
            "link_expires_at",
            email_step,
            "the email must carry the computed expiry timestamp, not just a duration",
        )
        presign_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Upload private APK and AAB and generate secure links"
        )
        self.assertIn("link_expires_at", presign_step, "that timestamp must actually be produced")
        self.assertIn("+7 days", presign_step, "it must be derived from the same seven days")

    def test_body_tells_the_recipient_how_to_get_a_new_link(self):
        email_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Email private APK and AAB delivery notice"
        )
        self.assertRegex(
            email_step,
            r"ask for a fresh one",
            "an expiring link is only acceptable if the recipient is told how to replace it",
        )

    def test_oversized_artifacts_are_not_silently_dropped(self):
        """The APK and AAB are ~160 MiB and ~190 MiB; the attach cap is 20 MiB.

        So in practice neither is ever attached and the links are the only way
        to obtain the build. The script says so when it skips one, and that
        behaviour is the only thing standing between the recipient and a
        silently unusable email.
        """
        script = EMAIL_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("MAX_ATTACHMENT_BYTES", script)
        self.assertRegex(
            script,
            r"not attached because of email size limits",
            "a skipped attachment must be stated in the email body",
        )
        self.assertRegex(
            script,
            r"use its private download link",
            "the recipient must be pointed at the link that replaces the attachment",
        )


class ReleaseEmailFailsLoudly(unittest.TestCase):
    """A swallowed send failure is an undelivered release reported as success."""

    def test_script_exits_non_zero_when_the_send_fails(self):
        script = EMAIL_SCRIPT.read_text(encoding="utf-8")
        self.assertRegex(
            script,
            r"except Exception as error:[\s\S]*?raise\s*$",
            "the top-level handler must re-raise, or a failed send exits 0 and the "
            "step is green while nothing was delivered",
        )

    def test_missing_delivery_secrets_fail_before_the_build(self):
        """Validated in the configuration step so a missing secret costs seconds
        rather than a full 25-minute build followed by a dead email.

        Asserted against the `required_secrets` list specifically. Merely finding
        the names somewhere in the step is not enough: the step's own `env:` block
        also mentions them, so a test that searched the whole step would keep
        passing after the names had been dropped from the list that actually
        enforces their presence.
        """
        validate_step = ReleaseDeliverySigning._step_named(
            workflow_text(), "Validate deployment configuration"
        )

        match = re.search(r"required_secrets=\(([^)]*)\)", validate_step, re.DOTALL)
        self.assertIsNotNone(
            match, "the configuration step must declare a required_secrets list"
        )
        enforced = set(re.findall(r"[A-Z0-9_]+", match.group(1)))

        for secret in ("RELEASE_AWS_ACCESS_KEY_ID", "RELEASE_AWS_SECRET_ACCESS_KEY"):
            self.assertIn(
                secret,
                enforced,
                f"{secret} must be in the enforced required_secrets list, not merely "
                "referenced by the step",
            )

        self.assertIn(
            "Missing workflow secret",
            validate_step,
            "a missing secret must produce a named, diagnosable failure",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
