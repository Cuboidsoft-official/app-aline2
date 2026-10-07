import html
import unittest
from download_summary import download_link, HOST


class DownloadLinks(unittest.TestCase):
    def test_mask_safe_destination_preserves_signed_url_exactly(self):
        url = f'https://{HOST}/android/private/expiring/example.apk?X-Amz-Credential=EXAMPLE%2Fscope&X-Amz-Signature=abc'
        markdown = download_link('Download APK', url)
        destination = markdown.split('](', 1)[1][:-1]
        self.assertEqual(html.unescape(destination), url)
        # Neither the full masked link nor a short unrelated mask occurs in source.
        self.assertNotIn(url, markdown)
        self.assertNotIn('aline2', markdown)
        self.assertNotIn('EXAMPLE', markdown)

    def test_refuses_unexpected_or_session_bound_links(self):
        urls = ['https://example.com/file?X-Amz-Signature=abc',
                f'https://{HOST}/users/data?X-Amz-Signature=abc',
                f'https://{HOST}/android/private/file?X-Amz-Signature=abc&X-Amz-Security-Token=session',
                f'https://{HOST}/android/private/file']
        for url in urls:
            with self.assertRaises(ValueError):
                download_link('APK', url)

class WorkflowDecisions(unittest.TestCase):
    def test_manual_preview_and_default_production_delivery(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        workflow=yaml.safe_load((root/'.github/workflows/android-apk.yml').read_text())
        triggers=workflow.get('on',workflow.get(True))
        self.assertTrue(triggers['workflow_dispatch']['inputs']['deliver']['default'])
        self.assertNotIn('pull_request',triggers)
        self.assertEqual(triggers['workflow_dispatch']['inputs']['target']['default'],'production')
        self.assertIn("inputs.target == 'pr-test'",workflow['jobs']['pr-test-apk']['if'])
        self.assertIn("inputs.target == 'production'",workflow['jobs']['release-android']['if'])
        self.assertIn("github.event_name == 'push'",workflow['jobs']['release-android']['if'])
        steps={s['name']:s for s in workflow['jobs']['release-android']['steps']}
        self.assertIn("deliver_release != 'true'",steps['Upload standard release artifacts']['if'])
        self.assertIn('Publish direct S3 downloads in summary',steps)

    def test_main_production_path_still_builds_and_delivers_play_release(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        workflow=yaml.safe_load((root/'.github/workflows/android-apk.yml').read_text())
        jobs=workflow['jobs']
        self.assertIn("github.event_name == 'push'",jobs['release-android']['if'])
        self.assertIn("inputs.target == 'production'",jobs['release-android']['if'])
        steps={step['name']:step for step in jobs['release-android']['steps']}
        metadata='\n'.join(steps['Derive release metadata']['run'].splitlines())
        self.assertIn('apk_mode="apk-aab"',metadata)
        self.assertIn('build_aab="true"',metadata)
        self.assertIn('deliver_release="true"',metadata)
        for name in ('Run typecheck','Run tests','Build release APK','Verify release artifacts',
                     'Upload private APK and AAB and generate secure links',
                     'Email private APK and AAB delivery notice'):
            self.assertIn(name,steps)

    def test_no_developer_pr_mutation_and_no_duplicate_signed_artifact(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        script=(root/'scripts/ci/publish_preview.py').read_text()
        self.assertNotIn('/comments',script)
        resolver=(root/'scripts/ci/resolve_preview.py').read_text()
        self.assertIn('REQUIRED_CHECKS',resolver)
        self.assertNotIn('build-test-apk',resolver)
        called=yaml.safe_load((root/'.github/workflows/android-preview-delivery.yml').read_text())
        workflow=yaml.safe_load((root/'.github/workflows/android-apk.yml').read_text())
        steps=workflow['jobs']['deliver-pr-test-apk']['steps']
        self.assertFalse(any('actions/upload-artifact@' in s.get('uses','') for s in steps))
        self.assertTrue(any('actions/upload-artifact@' in s.get('uses','') for s in called['jobs']['build-preview']['steps']))

    def test_preview_build_is_apk_only(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        jobs=yaml.safe_load((root/'.github/workflows/android-preview-delivery.yml').read_text())['jobs']
        steps={s['name']:s for s in jobs['build-preview']['steps']}
        self.assertEqual(steps['Build production-configured PR APK']['run'], 'bash scripts/build-android-release.sh apk')
        self.assertNotIn('bundleRelease', yaml.safe_dump(jobs['build-preview']))
        self.assertNotIn('apk-aab', yaml.safe_dump(jobs['build-preview']))

    def test_verification_never_builds_or_emails(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        workflow=yaml.safe_load((root/'.github/workflows/android-release-delivery.yml').read_text())
        triggers=workflow.get('on',workflow.get(True))
        self.assertIn('verify',triggers['workflow_dispatch']['inputs']['mode']['options'])
        job=workflow['jobs']['redeliver']
        self.assertIn("inputs.mode == 'verify'",job['if'])
        steps={s['name']:s for s in job['steps']}
        self.assertEqual(steps['Email the fresh delivery links']['if'],"inputs.mode == 'redeliver'")
        self.assertIn('Add refreshed download summary',steps)
        text=yaml.safe_dump(job)
        self.assertNotIn('gradlew',text)
        self.assertNotIn('build-android-release.sh',text)
        self.assertNotIn('aws s3 cp /tmp/release',text)
