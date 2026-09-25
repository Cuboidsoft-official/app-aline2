# Aline2 Play Store signing handover

This document records the Android upload-certificate identity and the safe
release procedure. Private keystores and passwords must remain outside Git and
are provided to GitHub Actions through repository secrets.

## Active Google Play upload certificate

The upload certificate accepted by Google Play is:

```text
SHA-256: 34:55:38:81:D7:A4:06:57:08:F8:C8:71:B4:D4:77:91:9A:04:6A:FD:D7:3C:06:B5:61:1A:DF:04:75:13:29:99
```

Evidence: GitHub Actions run `33988489077` built Aline2 v2.2.3, verified this
certificate on both artifacts, and successfully uploaded and committed the AAB
to the Google Play internal track on September 5, 2026. Later successful Play
uploads used the same certificate.

The production workflow pins this fingerprint. A different configured
keystore fails before artifact delivery.

## Legacy recovered certificate

Older May 25 artifacts were signed with a different certificate:

```text
SHA-256: 4E:CC:84:30:64:63:89:D5:93:0B:89:89:04:99:C5:56:9C:95:56:FB:68:4E:92:D3:83:41:35:53:28:1A:0C:4A
```

Do not use that legacy key for a new Play upload unless Google Play Console
shows that the upload key has been deliberately reset to that fingerprint.

## GitHub Actions signing material

The `Cuboidsoft-official/app-aline2` repository uses these write-only GitHub
secrets:

```text
ANDROID_UPLOAD_KEYSTORE_BASE64
ANDROID_UPLOAD_STORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
```

The workflow materializes the keystore only on the ephemeral GitHub-hosted
runner. It verifies the APK and AAB certificates against the configured
keystore and the pinned Google Play fingerprint, then records checksums.

## Production release procedure

1. Open an issue and a pull request from a short-lived feature branch.
2. Pass the required Android CI check on the exact pull-request head.
3. Obtain review and merge through protected `main`.
4. A qualifying app change on `main` builds the signed production APK and AAB.
5. Confirm the workflow's signing, bundletool, checksum, private S3 upload, and
   Cuboidsoft email steps all passed.
6. In Play Console, compare the upload certificate before uploading the AAB.
7. Upload the AAB manually, review Play validation and policy results, and use
   a staged rollout appropriate for the release.

Manual workflow dispatch remains available for a retry or a build-only check.
The arm64 diagnostic profile does not produce or deliver a Play AAB.

## Stop conditions

Do not upload or distribute a release when any of these checks fail:

- the package is not `com.aline2`;
- the certificate differs from the active fingerprint above;
- the workflow commit is not the reviewed `main` commit;
- type checks, tests, environment checks, signing verification, bundletool, or
  checksums fail;
- the version code is not greater than the Play Console version;
- Play Console reports an unexpected signing, package, permission, or policy
  error.

Never generate a replacement keystore to work around a mismatch. Use the
Google Play upload-key reset process and update GitHub secrets only after the
new certificate is confirmed in Play Console.

## Credential incident status

The active upload keystore and its credentials existed in the public Git
history before current safeguards were added. Treat the upload key as
compromised even though it remains accepted by Play. After the urgent release,
request a Google Play upload-key reset, replace all four GitHub signing secrets,
pin the new certificate, verify a signed AAB, and then complete coordinated
history cleanup. Removing the files from the current branch did not revoke the
old key.

## Custody

Maintain an encrypted offline backup of the active upload keystore and its
credentials with the authorized project owner. Do not store the backup in the
repository, ordinary email, chat, shared build folders, or the production EC2
host.
