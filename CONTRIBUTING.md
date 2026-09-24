# Contributing to the Aline2 Android app

`main` is the only integration and release branch. Keep changes small, use a short-lived branch, and merge through a pull request. Do not use `dev` or push directly to `main`, including for urgent fixes.

## Standard change flow

1. For a substantial feature, production bug, security change, or operations task, create an issue with impact, acceptance criteria, test plan, and rollback. A small routine change may use its pull request as the complete work record so trusted maintainers are not blocked by duplicate administration.
2. Add tracked issues to the [Aline2 delivery project](https://github.com/orgs/Cuboidsoft-official/projects/1) and move them to **In Progress** when work begins.
3. Update local `main`, then create a short-lived branch such as `fix/<issue-or-topic>-description`, `feat/<issue-or-topic>-description`, `ops/<issue-or-topic>-description`, or `docs/<issue-or-topic>-description`.
4. Commit focused changes. Never commit `.env` files, keystores, signing passwords, service-account JSON, server secrets, generated APK/AAB files, or private download links.
5. Open a pull request to `main`, link a tracking issue when one exists, and complete every applicable section of the pull-request template.
6. Keep the pull request current with `main`. The required **Android CI / validate** check must pass on the exact latest commit. It runs the sensitive-file policy, type checking, tests, and an unsigned native Android build. Existing lint debt is reported separately.
7. A reviewer with write access reviews the exact latest commit and records approval. New commits after approval require another review. Resolve every blocking finding before merge.
8. Merge through GitHub after branch protection passes, then delete the short-lived branch. Move the project item to **Done** only after the release evidence is recorded.

The signed production release workflow runs from reviewed app changes merged to `main`. It builds and verifies the APK and AAB, stores private artifacts, and sends time-limited delivery links to Cuboidsoft. Google Play upload and rollout remain manual; follow [BUILD_FOR_PLAYSTORE.md](BUILD_FOR_PLAYSTORE.md).

## Evidence expected in a pull request

- Automated checks and any focused commands run locally
- Before/after screenshots or a short recording for visible UI changes
- Device and Android version for manual mobile testing
- API, environment, Firebase, notification, permission, or migration impact
- Rollout and rollback steps for production-affecting changes
- Any known limitation or follow-up issue

Do not place credentials, production values, user data, private artifact URLs, or unredacted logs in issues, pull requests, comments, or screenshots.

## Fast changes and hotfixes

Urgency changes the response time, not the quality gate. Start from current `main`, keep the patch narrow, link the incident or bug, run required CI, obtain exact-head review, and merge through the protected branch. If production release automation fails, preserve the failed run, diagnose it, and retry the same reviewed `main` commit with the manual workflow; do not rebuild from an unreviewed local checkout.

## Ownership

- The author owns implementation, focused tests, release notes, and responding to review.
- The reviewer owns correctness, regression, security, privacy, and rollback review.
- The platform owner maintains GitHub protection, Actions secrets and variables, signing continuity, artifact delivery, and workflow reliability.
- The Play release operator verifies the signed AAB and completes the manual Play Console checklist.

Report a suspected credential exposure privately to the repository administrators. Do not open a public issue containing the credential. The platform owner must revoke or rotate the value and review its use before another release.
