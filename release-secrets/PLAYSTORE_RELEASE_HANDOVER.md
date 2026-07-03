# Aline2 Play Store Release Handover

This folder contains the recovered Android upload signing material required to build Play Store release artifacts for Aline2.

## Recovery Status

Recovered: yes

The verified upload keystore is:

```text
release-secrets/aline2-upload-2026.jks
```

The local environment file containing the required signing variables is:

```text
release-secrets/aline2-upload-2026.env
```

Keep this file private. It contains the keystore path, store password, key alias, and key password.

## Verified Upload Certificate

```text
Alias: aline2-upload-2026
Owner: CN=Aline2 Upload, OU=CuboidSoft, O=CuboidSoft, L=Balaghat, ST=Madhya Pradesh, C=IN
Created: May 25, 2026
Valid until: Oct 10, 2053
SHA256: 4E:CC:84:30:64:63:89:D5:93:0B:89:89:04:99:C5:56:9C:95:56:FB:68:4E:92:D3:83:41:35:53:28:1A:0C:4A
```

Before uploading any new AAB to Play Console, confirm the Play Console upload certificate SHA-256 matches the value above.

## Important Warning

Not all old local AAB files are signed with the same certificate.

The May 25 release artifacts match the recovered upload key:

```text
release-artifacts/aline2-android-20260525-232337/aline2-release-1.0.3-vc4.aab
release-artifacts/aline2-android-20260525-234113-1.0.4-vc5/aline2-release-1.0.4-vc5.aab
```

The May 26 artifact was signed with a different certificate:

```text
release-artifacts/aline2-android-20260526-738b904/Aline2-v1.0.4-20260526-738b904.aab
SHA256: 34:55:38:81:D7:A4:06:57:08:F8:C8:71:B4:D4:77:91:9A:04:6A:FD:D7:3C:06:B5:61:1A:DF:04:75:13:29:99
```

Do not upload artifacts signed with the wrong certificate unless Play Console explicitly shows that same upload certificate.

## Local Build Steps

Run from the repository root:

```bash
cd app-aline2
set -a
. ../release-secrets/aline2-upload-2026.env
set +a
ENVFILE=.env.production ./scripts/build-android-release.sh aab
ENVFILE=.env.production ./scripts/build-android-release.sh apk
```

Expected Android package:

```text
com.aline2
```

Current local app version at time of recovery:

```text
versionCode 5
versionName 1.0.4
```

## Verify Keystore

```bash
set -a
. release-secrets/aline2-upload-2026.env
set +a
keytool -list -v \
  -keystore "$ANDROID_UPLOAD_STORE_FILE" \
  -storepass "$ANDROID_UPLOAD_STORE_PASSWORD" \
  -alias "$ANDROID_UPLOAD_KEY_ALIAS"
```

The output must include:

```text
SHA256: 4E:CC:84:30:64:63:89:D5:93:0B:89:89:04:99:C5:56:9C:95:56:FB:68:4E:92:D3:83:41:35:53:28:1A:0C:4A
```

## Verify AAB Certificate

```bash
keytool -printcert -jarfile path/to/release.aab
```

The AAB certificate SHA-256 must match the Play Console upload certificate.

## GitHub Actions

The GitHub repository `ayushman-it/app-aline2` has these release signing secrets configured:

```text
ANDROID_UPLOAD_KEYSTORE_BASE64
ANDROID_UPLOAD_STORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
```

GitHub secrets are write-only. They can be used by Actions, but cannot be read back in plaintext from GitHub.

The workflow materializes the keystore from `ANDROID_UPLOAD_KEYSTORE_BASE64` and builds with the `ANDROID_UPLOAD_*` variables.

## Handover Checklist

Give the new owner:

```text
release-secrets/aline2-upload-2026.jks
release-secrets/aline2-upload-2026.env
release-secrets/aline2-upload-2026-certificate.txt
release-secrets/aline2-upload-2026-certificate.pem
release-secrets/PLAYSTORE_RELEASE_HANDOVER.md
```

Also give access to:

```text
Google Play Console app
GitHub repo: ayushman-it/app-aline2
Firebase project
Production API/backend hosting
```

## Security Notes

- Do not commit `release-secrets/` to Git.
- Do not send the `.env` file in normal chat or email.
- Transfer the folder using an encrypted channel or password-protected archive.
- Store a second backup with the final project owner.
- If Play Console upload key does not match this SHA-256, stop and recover the key that matches Play Console instead.
