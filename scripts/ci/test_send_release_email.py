import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).with_name("send_release_email.py")
SPEC = importlib.util.spec_from_file_location("send_release_email", SCRIPT_PATH)
assert SPEC and SPEC.loader
send_release_email = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(send_release_email)


class FakeSmtp:
    sent_message = None

    def __init__(self, *_args, **_kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def ehlo(self):
        pass

    def starttls(self, **_kwargs):
        pass

    def login(self, *_args):
        pass

    def send_message(self, message):
        FakeSmtp.sent_message = message


class ReleaseEmailTests(unittest.TestCase):
    def test_email_includes_durable_and_short_lived_download_options(self):
        environment = {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "user",
            "SMTP_PASSWORD": "password",
            "SMTP_FROM": "releases@example.com",
            "SMTP_TO": "recipient@example.com",
            "EMAIL_SUBJECT": "Aline2 release",
            "EMAIL_BODY": "Release ready.",
            "RELEASE_NAME": "Aline2-v2.3.0-20260924-42f9e29-r136-a1",
            "ARTIFACT_RUN_URL": "https://github.example/actions/runs/123",
            "APK_DOWNLOAD_URL": "https://download.example/app.apk",
            "AAB_DOWNLOAD_URL": "https://download.example/app.aab",
        }

        FakeSmtp.sent_message = None
        with patch.dict(os.environ, environment, clear=True), patch.object(
            send_release_email.smtplib, "SMTP", FakeSmtp
        ):
            self.assertEqual(send_release_email.main(), 0)

        self.assertIsNotNone(FakeSmtp.sent_message)
        body = FakeSmtp.sent_message.get_body(preferencelist=("plain",)).get_content()
        self.assertIn(environment["ARTIFACT_RUN_URL"], body)
        self.assertIn(environment["APK_DOWNLOAD_URL"], body)
        self.assertIn(environment["AAB_DOWNLOAD_URL"], body)
        self.assertIn(environment["RELEASE_NAME"], body)


if __name__ == "__main__":
    unittest.main()
