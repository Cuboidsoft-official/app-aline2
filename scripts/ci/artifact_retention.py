#!/usr/bin/env python3
"""Cap renewed S3 links to the actual retained-object window."""
import json
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
        print(link_seconds(json.load(open(sys.argv[1])), int(sys.argv[2])))
    except (ValueError, KeyError, OSError) as error:
        sys.exit(str(error))
