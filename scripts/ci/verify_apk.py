#!/usr/bin/env python3
"""Validate APK packaging independently of Gradle's successful exit."""
import argparse
import re
import subprocess
import zipfile
from pathlib import Path


def verify(path, tools, version_code, profile):
    with zipfile.ZipFile(path) as archive:
        damaged = archive.testzip()
        if damaged:
            raise ValueError(f"Corrupt ZIP entry: {damaged}")
        abis = {name.split('/')[1] for name in archive.namelist()
                if name.startswith('lib/') and name.endswith('.so')}
        expected = {'arm64-v8a'} if profile == 'arm64' else {'armeabi-v7a', 'arm64-v8a'}
        if abis != expected:
            raise ValueError(f"APK ABIs {sorted(abis)} do not match {sorted(expected)}")
        if archive.getinfo('resources.arsc').compress_type != zipfile.ZIP_STORED:
            raise ValueError('resources.arsc must be stored uncompressed')
    subprocess.run([str(tools / 'apksigner'), 'verify', '--verbose', str(path)], check=True)
    subprocess.run([str(tools / 'zipalign'), '-c', '-P', '16', '4', str(path)], check=True)
    badging = subprocess.check_output([str(tools / 'aapt'), 'dump', 'badging', str(path)], text=True)
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)'", badging)
    if not package or package.group(1) != 'com.aline2' or int(package.group(2)) != version_code:
        raise ValueError('APK package/versionCode does not match this CI run')
    print(f'APK verified: com.aline2 versionCode={version_code}, ABIs={sorted(abis)}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--tools', type=Path, required=True)
    parser.add_argument('--version-code', type=int, required=True)
    parser.add_argument('--profile', choices=['standard', 'arm64'], default='standard')
    args = parser.parse_args()
    verify(args.apk, args.tools, args.version_code, args.profile)
