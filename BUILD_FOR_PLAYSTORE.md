# Android production build and Google Play release

The canonical production build runs in GitHub Actions. Do not build Play artifacts from a developer laptop and do not place signing values in scripts or repository files.

## Release path

1. Merge a reviewed, CI-passing app change into protected `main`.
2. The **Android Release** workflow builds the exact `main` commit on a GitHub-hosted runner. App-relevant changes trigger a standard release automatically. A release operator can also use **Run workflow** on `main` to retry a reviewed commit.
3. The workflow runs the sensitive-file policy, type checking, tests, the production configuration checks, signed APK/AAB builds, signature comparison, `bundletool` validation, and SHA-256 checksum generation. Lint currently reports known debt without blocking the release.
4. The verified APK, AAB, and checksum files remain in the workflow run for 30 days. A delivered standard release is also copied to private object storage and Cuboidsoft receives seven-day download links by email.
5. A release operator manually uploads the verified AAB to Google Play Console. The workflow never publishes to Google Play.

Automatic production delivery applies only to reviewed app changes merged to `main`; documentation-only and workflow-only changes do not create a new app release. The `arm64` manual profile is a diagnostic APK build and does not produce or deliver a Play bundle.

## Before merge

- Update `package.json` `version` and Android `versionName` together when the public version changes. They must match.
- Do not manually reuse a Play version code. The release workflow assigns a monotonically increasing `versionCode` to standard bundles.
- Confirm the pull request describes user impact, release notes, manual test evidence, Firebase/notification impact, and rollback.
- Confirm **Android CI / validate** passes on the exact commit approved by the reviewer.
- For changes that affect backend contracts or remote configuration, verify the production dependency is compatible before merging the app.

## Required GitHub production configuration

Repository administrators maintain these names in GitHub Actions. Contributors should verify presence and workflow success, never copy values into an issue or pull request.

| Purpose | GitHub configuration |
| --- | --- |
| Upload keystore | `ANDROID_UPLOAD_KEYSTORE_BASE64` secret |
| Signing credentials | `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_PASSWORD` secrets and `ANDROID_UPLOAD_KEY_ALIAS` variable/secret |
| Production mobile configuration | `BACKEND_ORIGIN`, `API_BASE_URL`, `SOCKET_URL`, `SHARE_BASE_URL`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `YOUTUBE_DATA_API_KEY`, `GEMINI_API_KEY`, `ZEGO_CLOUD_APP_ID`, `ZEGO_CLOUD_APP_SIGN` variables/secrets as referenced by the workflow |
| Private delivery | `AWS_ROLE_TO_ASSUME` secret plus `AWS_REGION` and `PRIVATE_RELEASES_BUCKET` variables |
| Delivery email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` secrets |

The production GitHub environment is restricted to `main`. The repository must never contain the release keystore, signing passwords, `.env.production`, Firebase Admin/service-account JSON, or server-only payment and webhook secrets. The client Firebase configuration file may be tracked only for the Android client package; administrative Firebase credentials are server-side secrets.

## Retrieve and verify the release

Open the successful **Android Release** workflow run for the target `main` commit.

1. Record the full commit SHA, workflow run URL, version name, generated version code, artifact name, and run conclusion.
2. Download the standard release artifact while signed in to GitHub, or use the private Cuboidsoft email links before they expire.
3. Run `sha256sum -c <file>.sha256` for both APK and AAB from the same workflow run.
4. Confirm the run's **Verify release artifacts** step passed. It checks that APK and AAB use the same configured upload certificate and validates the AAB with `bundletool`.
5. Compare the AAB upload certificate SHA-256 with Google Play Console's registered **Upload key certificate** under app integrity. Stop if it differs. Never replace or rotate an upload key during a routine release.
6. Confirm the AAB package is `com.aline2`, its version name is intended for the release, and its version code is higher than every code already uploaded to Play.

Use the AAB for Google Play. The APK is for controlled installation and smoke testing only.

## Manual Google Play Console checklist

1. Open the Aline2 app in Google Play Console and select the intended track. Use an internal or closed testing track first for changes with material user risk.
2. Upload the verified AAB from the successful workflow run.
3. Confirm Play accepts the package, upload certificate, target API level, and version code without warnings that block release.
4. Add reviewed release notes that match the merged scope. Do not claim unfinished work.
5. Review the generated device support and app bundle details. Resolve unexpected permission, device exclusion, native library, or size changes before rollout.
6. Install the Play-delivered build through the selected testing track and smoke test login, API access, realtime connectivity, media, payments where applicable, and push notifications on a registered production-like test device.
7. In Firebase, confirm Android package `com.aline2` and the required SHA fingerprints remain registered. Send a controlled test notification and verify foreground, background, and tap behavior when notification code or configuration changed.
8. Start with a staged production rollout when risk warrants it. Record the rollout percentage, owner, start time, crash/ANR signals, and critical journey results in the linked issue or release record.
9. Increase the rollout only when the agreed observation window is healthy. Halt the rollout on a material crash, ANR, login, payment, notification, or backend-compatibility regression.

## Recovery

- Build failure: keep the failed run as evidence, fix through a pull request, or retry the same reviewed `main` commit with the manual workflow when the cause was transient.
- Delivery failure after artifact verification: retrieve the GitHub artifact and rerun delivery from the reviewed commit after the delivery dependency is healthy. Do not rebuild on an unreviewed branch.
- Play rejection: do not alter signing material. Record the exact Play error, correct the metadata or code through a pull request, and create a new verified bundle.
- Bad rollout: halt the rollout in Play Console. Revert or hotfix from current `main` through the standard PR and CI path, then publish the newly verified AAB with a higher version code. An older AAB cannot replace a higher Play version code.

Release completion evidence consists of the linked issue and PR, exact merge SHA, successful workflow run, checksum verification, upload-certificate match, Play track and version code, release notes, smoke-test result, rollout owner, and rollback decision.
