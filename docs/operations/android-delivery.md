# Android delivery

## Developer flow

1. Open a PR targeting `main`. Required `workflows` and `validate` checks run.
   They cover workflow lint, sensitive-file policy, delivery-contract tests,
   type checking and Jest. Lint debt remains advisory.
2. After the latest PR commit has green required checks, open **Actions → Android
   Release → Run workflow**, select branch `main`, choose **PR test APK**, and
   enter the PR number. This is a manual request; no APK is built automatically
   for each PR or commit. The workflow rechecks the open PR, exact latest commit,
   collaborator permission and green checks before it starts compiling. It
   rejects fork PRs, stale commits, failed/pending checks and docs-only PRs.
3. Download the standard ARM 32/64-bit APK from that run's summary. The PR build
   does not create an AAB, send email, or start a production release. It reuses
   the trusted npm/Gradle dependency cache and does not rerun tests that already
   passed on that commit. A fresh native compile is still required for the APK.
   The release APK bundles the JavaScript app and runs without Metro or a
   Gradle daemon on the phone; it still uses Aline2's configured online APIs.
   No developer email mapping or automated PR comments are used. The APK uses
   production mobile configuration; testing can affect live data.
4. The developer decides when to merge. App-input changes on main build one
   production APK/AAB together, deliver direct S3 downloads in the run summary,
   and email Cuboidsoft. PR test builds cannot enter that production job. CI/docs-only
   merges do not trigger a production release. Manual production release delivery
   defaults to enabled. Play upload is manual.

`standard` is the normal release profile. `arm64` is diagnostic-only, excludes
32-bit devices and does not produce a Play AAB or send the delivery email. Both
profiles and previews receive versionCode = 100000 + Android Release run number.
Reruns preserve their run number; a genuinely newer release needs a new run.
Do not run an older commit and treat its higher code as the latest source.

PR APK signing happens in a reusable workflow called only from the trusted
`main` workflow after an exact-head, same-repository, green-check and
requesting-collaborator check. PR scripts never execute with production signing
or AWS credentials. The authorized build job does receive mobile runtime
configuration already distributed in the app. Fork PRs cannot receive the
production signature. The temporary input artifact is not the delivered APK.
PR test and production builds share the Android Release workflow run number, so
test version codes remain in the same increasing sequence as production builds.

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
After successful PR delivery, the isolated signer removes only its own temporary
input artifact. On failure, one-day retention is the fallback. GitHub retains
one-day diagnostic/build-only artifacts when S3 delivery is deliberately off.
After expiry, redelivery cannot resurrect deleted files: request a new build.
Within the retention window, Android Release Delivery can refresh existing S3
links without compiling again. Choose `verify` to check APK/AAB links and publish
a download summary without emailing anyone; choose `redeliver` to also email
Cuboidsoft. `check` remains the lightweight credential health check. The date identifies the latest delivered release for that day. For releases
delivered after this fix, use optional `release_name` to select the exact
per-release record, so multiple same-day deliveries do not overwrite recovery
metadata. Per-release records expire with the seven-day artifacts. Older
releases retain their existing date-only record. Do not overwrite older live links during a cleanup.

The 500 MB private-repository allowance is shared with other organization private
artifact/Package usage, not a per-release allowance. Keep npm/Gradle caches for
speed; cache has a separate per-repository limit. Before converting private on
GitHub Free, resolve environment secrets and branch-protection availability.

Rollback is a reviewed revert of this CI change. Main APK uploads and Play
publishing remain separate; this change does not restart EC2 or deploy backend.

## Incident evidence (2026-10-06)

Release #153 was standard with both ARM ABIs, versionCode 100153. Its native
libraries were byte-identical to #152. Both used the same Ubuntu 24.04 runner
image. PR #65 changed production APK/AAB packaging to one combined Gradle
invocation; run #160 was standard and passed the structural APK verifier, but
its reported handset install failure still lacks an exact-device install log
and downloaded-file checksum. Neither runner pinning nor the reported parse
failure has been proven to be the cause. Manual #154 was ARM64-only and
incorrectly retained source versionCode 32; that separate downgrade defect was
fixed by later release-workflow changes.

The scheduled signed-download probe refreshes its existing tiny sentinel only
following a successful byte-for-byte fetch, preventing a quiet month from
expiring the probe under the older 30-day rule. It does not change APK/AAB files.
