#!/usr/bin/env python3
"""Cap renewed S3 links to the actual retained-object window."""
import json
import datetime
import subprocess
import sys
import time


def link_seconds(record, days, now=None):
    if days not in (1, 7):
        raise ValueError("Only one-day and seven-day links are supported")
    seconds = days * 86400
    deadline = record.get("retentionExpiresAt")
    if deadline is not None:
        if not isinstance(deadline, int) or isinstance(deadline, bool):
            raise ValueError("Invalid artifact retention deadline")
        seconds = min(seconds, deadline - int(time.time() if now is None else now) - 60)
    if seconds < 60:
        raise ValueError("S3 retention window has ended; download the GitHub backup artifact instead")
    return seconds


if __name__ == "__main__":
    try:
        record = json.load(open(sys.argv[1]))
        # Legacy records predate explicit retention; cap against both objects'
        # actual upload times and the existing 30-day lifecycle policy.
        if record.get('retentionExpiresAt') is None:
            bucket = sys.argv[3]
            deadlines = []
            for field in ('apkKey', 'aabKey'):
                key = record[field]
                if not isinstance(key, str) or not key.startswith('android/private/') or '\n' in key:
                    raise ValueError('Invalid retained artifact key')
                if key.startswith('android/private/expiring/'):
                    raise ValueError('Seven-day artifact is missing its retention deadline')
                modified = subprocess.check_output(['aws', 's3api', 'head-object', '--bucket', bucket,
                                                    '--key', key, '--query', 'LastModified', '--output', 'text'], text=True).strip()
                created = datetime.datetime.fromisoformat(modified.replace('Z', '+00:00'))
                deadlines.append(int(created.timestamp()) + 30 * 86400)
            record['retentionExpiresAt'] = min(deadlines)
        print(link_seconds(record, int(sys.argv[2])))
    except (ValueError, KeyError, OSError) as error:
        sys.exit(str(error))
