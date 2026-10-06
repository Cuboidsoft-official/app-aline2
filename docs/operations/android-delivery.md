# Android delivery

## Developer flow

1. Open a PR targeting main. Fast `validate` checks run type checking, Jest,
   sensitive-file policy and delivery contracts; workflow lint runs separately.
   Opening/updating an ordinary PR does not build a native APK.
2. When a test APK is needed, the developer adds the `build-test-apk` label.
   The next PR event builds the current exact head. Leaving the label in place
   requests another APK after each update; remove it to stop requesting builds.
   This optional check is not required for every merge. Fork previews are refused.
3. Download the signed standard ARM 32/64-bit APK from Android Preview Delivery's
   run summary. No developer email mapping or automated PR comments are used.
   The build uses production mobile configuration; testing can affect live data.
4. The developer decides when to merge. App-input changes on main build one
   production APK/AAB together, deliver direct S3 downloads in the run summary,
   and email Cuboidsoft. CI/docs-only merges do not trigger a production release.
   Manual standard release delivery defaults to enabled. Play upload is manual.

`standard` is the normal release profile. `arm64` is diagnostic-only, excludes
32-bit devices and does not produce a Play AAB or send the delivery email. Both
profiles and previews receive versionCode = 100000 + Android Release run number.
Reruns preserve their run number; a genuinely newer release needs a new run.
Do not run an older commit and treat its higher code as the latest source.

PR APK signing happens in a default-branch workflow after an exact-head,
same-repository, successful-run and collaborator-permission check. PR scripts
never execute with production signing or AWS credentials. The authorized build
job does receive mobile runtime configuration already distributed in the app. Fork PRs cannot receive the
production signature. The temporary input artifact is not the delivered APK.

CI APKs use the upload certificate. A Play installation uses Google's app
signing certificate and normally cannot be updated by this APK. Use a test
phone/profile or the Play internal track; do not uninstall user data to bypass
this. APK ZIP, signature, versionCode, package, ABIs and 16 KiB ZIP alignment are
checked, but these checks do not replace an install test on a failing device.

## Downloads, retention and recovery

At the owner's explicit request, S3 bearer download URLs are visible in Actions
summaries and Cuboidsoft email. Anyone holding a link can download until expiry.
`download_summary.py` accepts only non-session signed links to the release bucket.
It represents Markdown link destinations as HTML character references. GitHub
renders those references into the exact signed URL, avoiding corruption from
short unrelated secret masks. Raw links remain masked in logs; AWS secret keys
are never put in summaries. Render-and-download verification is required.

Final APK/AAB files are retained only in S3, under `android/private/expiring/`.
The existing verified lifecycle rule expires that prefix after seven days; S3
processes deletion asynchronously, so deletion is not exact to the second.
Older releases retain their existing policy. No user-media bucket is involved.
GitHub retains only a one-day temporary input for isolated PR signing, and
one-day diagnostic/build-only artifacts when S3 delivery is deliberately off.
After expiry, redelivery cannot resurrect deleted files: request a new build.
Within the retention window, Android Release Delivery can refresh existing S3
links without compiling again. Its date-based release record currently identifies
only the most recently delivered release for a date; earlier runs require their
exact object keys. Do not overwrite older live links during a cleanup.

The 500 MB private-repository allowance is shared with other organization private
artifact/Package usage, not a per-release allowance. Keep npm/Gradle caches for
speed; cache has a separate per-repository limit. Before converting private on
GitHub Free, resolve environment secrets and branch-protection availability.

Rollback is a reviewed revert of this CI change. Main APK uploads and Play
publishing remain separate; this change does not restart EC2 or deploy backend.

## Incident evidence (2026-10-06)

Release #153 was standard with both ARM ABIs, versionCode 100153. Its native
libraries were byte-identical to #152. Both used the same Ubuntu 24.04 runner
image. The generic screenshot is not proof of an Ubuntu/native-library defect.
Manual #154 was ARM64-only and incorrectly retained source versionCode 32;
this workflow fixes that verified downgrade defect. The #153 phone failure still
needs the exact device/Android version, downloaded checksum and package-manager
install error. Do not call that separate incident resolved without those checks.
