# Android delivery

## Developer flow

1. Open a PR targeting main. Fast `validate` checks run type checking, Jest,
   sensitive-file policy and delivery contracts; workflow lint runs separately.
2. Android-input changes build one release-mode, standard ARM 32/64-bit PR APK.
   The trusted Android Preview Delivery workflow builds with full production
   mobile configuration, then verifies and signs the exact current head,
   then posts a GitHub artifact download link on the PR. Download the ZIP and
   extract the APK. No per-developer email or manual ARM64 rebuild is needed.
   Documentation-only PRs skip the native build. Updated PRs cancel stale builds.
   The exact-head `PR release APK` check reports build and delivery results.
3. Test on a test device. This preview talks to production backend URLs; test
   actions may affect production data. Full mobile integration configuration is
   available; the APK still requires manual integration journey testing.
4. Merge after checks and self-review. Main builds the fully configured signed
   standard APK and Play AAB together, with one native build invocation. The
   existing Cuboidsoft email receives private S3 links; the run summary includes
   the GitHub artifact download. Play Console upload remains manual.

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

The app repository is public. At the owner's explicit request, seven-day S3
bearer URLs are posted in PRs and release summaries, as well as Cuboidsoft email.
Anyone with a link can download until expiry. GitHub artifacts follow GitHub's
access rules; neither channel is confidential distribution.

New production APK/AAB objects live under `android/private/expiring/` and expire
through S3 Lifecycle after seven days. S3 removes eligible objects asynchronously,
not at the exact second a link expires. Existing objects retain their previous
30-day policy; neither existing artifacts nor the health-check sentinel get the
new rule. The bucket is unversioned; lifecycle expiration actually removes data.

Production GitHub backup artifacts last 30 days; PR artifacts last seven days.
The one-day disposable preview input is retained only for the trusted signing
handoff. Legacy redelivery is also capped against the objects' 30-day lifetime. Redelivery supports one or seven days, capped by the recorded S3 retention
deadline minus a safety margin. After that window, download the GitHub backup;
rebuilding is necessary only if every retained copy has expired. The daily record
still resolves the last release that day; exact artifact names remain in each run.

The versioned lifecycle proposal is `deploy/android-artifact-lifecycle.json`.
Before applying it, confirm AWS account 497172038254, the exact artifact bucket,
unversioned status and an empty new prefix. Back up the existing policy. Apply
without replacing unrelated rules, read it back, and retain the policy backup.
Rollback removes the new rule and reverts this CI PR; objects already expired
cannot be recovered, so never extend the rule to legacy or user-data prefixes.

## Incident evidence (2026-10-06)

Release #153 was standard with both ARM ABIs, versionCode 100153. Its native
libraries were byte-identical to #152. Both used the same Ubuntu 24.04 runner
image. The generic screenshot is not proof of an Ubuntu/native-library defect.
Manual #154 was ARM64-only and incorrectly retained source versionCode 32;
this workflow fixes that verified downgrade defect. The #153 phone failure still
needs the exact device/Android version, downloaded checksum and package-manager
install error. Do not call that separate incident resolved without those checks.
