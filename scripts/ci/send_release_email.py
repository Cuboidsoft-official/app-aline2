#!/usr/bin/env python3
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path


MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024


def get_env(name: str, required: bool = True, default: str = "") -> str:
    value = os.getenv(name, default).strip()
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main() -> int:
    smtp_host = get_env("SMTP_HOST")
    smtp_port = int(get_env("SMTP_PORT"))
    smtp_user = get_env("SMTP_USERNAME")
    smtp_password = get_env("SMTP_PASSWORD")
    smtp_from = get_env("SMTP_FROM")
    smtp_to = get_env("SMTP_TO")
    subject = get_env("EMAIL_SUBJECT")
    body = get_env("EMAIL_BODY")
    release_name = get_env("RELEASE_NAME", required=False)
    download_url = get_env("AAB_DOWNLOAD_URL", required=False)
    attachment_path = os.getenv("AAB_ATTACHMENT_PATH", "").strip()

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = smtp_to

    lines = [body]
    if release_name:
        lines.append("")
        lines.append(f"Release: {release_name}")
    if download_url:
        lines.append("")
        lines.append(f"Private AAB download: {download_url}")

    attached = False
    if attachment_path:
        attachment = Path(attachment_path)
        if attachment.exists() and attachment.stat().st_size <= MAX_ATTACHMENT_BYTES:
            with attachment.open("rb") as file_handle:
                message.add_attachment(
                    file_handle.read(),
                    maintype="application",
                    subtype="octet-stream",
                    filename=attachment.name,
                )
            attached = True
        elif attachment.exists():
            lines.append("")
            lines.append(
                "The AAB is larger than standard email attachment limits, so this email includes a private download link instead."
            )

    if attached:
        lines.append("")
        lines.append("The AAB is attached to this email.")

    message.set_content("\n".join(lines))

    context = ssl.create_default_context()
    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
            server.login(smtp_user, smtp_password)
            server.send_message(message)
        return 0

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.ehlo()
        server.starttls(context=context)
        server.ehlo()
        server.login(smtp_user, smtp_password)
        server.send_message(message)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
