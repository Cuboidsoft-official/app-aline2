"""Render owner-approved S3 bearer links without publishing credential values.

Character references preserve the exact URL in GitHub Markdown rendering while
preventing unrelated short secret masks from corrupting its literal hostname.
Only release-bucket URLs are accepted. Never pass AWS secret keys here.
"""
import os
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

HOST = 'aline2-release-artifacts-497172038254.s3.ap-south-1.amazonaws.com'


def download_link(label, url):
    parsed = urlsplit(url)
    query = parse_qs(parsed.query)
    if (parsed.scheme != 'https' or parsed.netloc != HOST
            or not parsed.path.startswith('/android/private/')
            or parsed.fragment or 'X-Amz-Signature' not in query
            or 'X-Amz-Security-Token' in query):
        raise ValueError('Expected a non-session signed release-bucket download URL')
    # GitHub decodes character references when rendering Markdown destinations.
    destination = ''.join(f'&#{ord(char)};' for char in url)
    return f'[{label}]({destination})'


def main():
    lines = ['## S3 release downloads', download_link('Download APK', os.environ['APK_URL'])]
    if os.environ.get('AAB_URL'):
        lines.append(download_link('Download Play AAB', os.environ['AAB_URL']))
    lines.append(f"Links expire: {os.environ['EXPIRES']}. S3 files are retained for seven days.")
    with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as out:
        out.write('\n\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
