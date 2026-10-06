import copy
import unittest
from pathlib import Path
import yaml
from resolve_preview import eligible


class PreviewProvenance(unittest.TestCase):
    def setUp(self):
        self.run = {'event': 'pull_request', 'conclusion': 'success',
                    'path': '.github/workflows/android-apk.yml', 'head_repository': {'id': 1}, 'head_sha': 'abc'}
        self.pr = {'state': 'open', 'head': {'sha': 'abc', 'repo': {'id': 1}},
                   'base': {'ref': 'main', 'repo': {'id': 1}}}

    def test_exact_current_same_repository_pr(self):
        self.assertEqual(eligible(self.run, [self.pr], 1), self.pr)

    def test_fork_failed_and_other_workflow_are_rejected(self):
        for field, value in [('head_repository', {'id': 2}), ('conclusion', 'failure'),
                             ('event', 'push'), ('path', '.github/workflows/untrusted.yml')]:
            run = dict(self.run, **{field: value})
            self.assertIsNone(eligible(run, [self.pr], 1))

    def test_stale_closed_and_wrong_target_are_rejected(self):
        for change in ('stale', 'closed', 'target', 'fork'):
            pr = copy.deepcopy(self.pr)
            if change == 'stale': pr['head']['sha'] = 'def'
            if change == 'closed': pr['state'] = 'closed'
            if change == 'target': pr['base']['ref'] = 'dev'
            if change == 'fork': pr['head']['repo']['id'] = 2
            self.assertIsNone(eligible(self.run, [pr], 1))

    def test_build_gets_mobile_config_but_no_infrastructure_keys(self):
        root = Path(__file__).resolve().parents[2]
        jobs = yaml.safe_load((root / '.github/workflows/android-preview-delivery.yml').read_text())['jobs']
        build = yaml.safe_dump(jobs['build-preview'])
        self.assertIn('chmod +x android/gradlew', build)
        self.assertIn('GEMINI_API_KEY', build)
        self.assertIn('ZEGO_CLOUD_APP_SIGN', build)
        for forbidden in ('RELEASE_AWS_SECRET_ACCESS_KEY', 'ANDROID_UPLOAD_KEYSTORE_BASE64', 'SMTP_PASSWORD'):
            self.assertNotIn(forbidden, build)
        self.assertEqual(jobs['build-preview']['permissions'], {'contents': 'read'})
        main = yaml.safe_load((root / '.github/workflows/android-apk.yml').read_text())['jobs']['release-android']
        self.assertIn("github.event_name != 'pull_request'", main['if'])

    def test_signer_never_checks_out_pr_code(self):
        root = Path(__file__).resolve().parents[2]
        jobs = yaml.safe_load((root / '.github/workflows/android-preview-delivery.yml').read_text())['jobs']
        deliver = jobs['deliver']
        self.assertEqual(deliver['steps'][0]['with']['ref'], '${{ github.sha }}')
        self.assertFalse(deliver['steps'][0]['with']['persist-credentials'])
        self.assertNotIn('npm ci', yaml.safe_dump(deliver))
        self.assertNotIn('build-android-release.sh', yaml.safe_dump(deliver))

    def test_delivery_env_preserves_both_email_links(self):
        root = Path(__file__).resolve().parents[2]
        jobs = yaml.safe_load((root / '.github/workflows/android-apk.yml').read_text())['jobs']
        steps = {s.get('name'): s for s in jobs['release-android']['steps']}
        for name in ('Verify delivery links resolve before emailing', 'Email private APK and AAB delivery notice'):
            self.assertIn('APK_DOWNLOAD_URL', steps[name]['env'])
            self.assertIn('AAB_DOWNLOAD_URL', steps[name]['env'])
        for name in ('Calculate Android version code', 'Apply Android version code'):
            self.assertNotIn('if', steps[name])
        self.assertNotIn('Build release AAB', steps)
        self.assertIn('apk-aab', (root / 'scripts/build-android-release.sh').read_text())

    def test_retention_is_scoped_away_from_existing_downloads(self):
        import json
        root = Path(__file__).resolve().parents[2]
        config = json.loads((root / 'deploy/android-artifact-lifecycle.json').read_text())
        rules = {r['ID']: r for r in config['Rules']}
        self.assertEqual(rules['expire-android-release-artifacts']['Expiration']['Days'], 30)
        new = rules['expire-new-android-downloads-seven-days']
        self.assertEqual(new['Filter']['Prefix'], 'android/private/expiring/')
        self.assertEqual(new['Expiration']['Days'], 7)
