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
    def test_opt_in_preview_and_default_delivery(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        workflow=yaml.safe_load((root/'.github/workflows/android-apk.yml').read_text())
        triggers=workflow.get('on',workflow.get(True))
        self.assertTrue(triggers['workflow_dispatch']['inputs']['deliver']['default'])
        self.assertIn('labeled',triggers['pull_request']['types'])
        self.assertIn('build-test-apk',workflow['jobs']['preview-request']['if'])
        self.assertIn("github.event_name != 'pull_request'",workflow['jobs']['release-android']['if'])
        steps={s['name']:s for s in workflow['jobs']['release-android']['steps']}
        self.assertIn("deliver_release != 'true'",steps['Upload standard release artifacts']['if'])
        self.assertIn('Publish direct S3 downloads in summary',steps)

    def test_no_developer_pr_mutation_and_no_duplicate_signed_artifact(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        script=(root/'scripts/ci/publish_preview.py').read_text()
        self.assertNotIn('/comments',script)
        resolver=(root/'scripts/ci/resolve_preview.py').read_text()
        self.assertIn("'build-test-apk' not in",resolver)
        workflow=yaml.safe_load((root/'.github/workflows/android-preview-delivery.yml').read_text())
        steps=workflow['jobs']['deliver']['steps']
        self.assertFalse(any('actions/upload-artifact@' in s.get('uses','') for s in steps))
        self.assertTrue(any('actions/upload-artifact@' in s.get('uses','') for s in workflow['jobs']['build-preview']['steps']))

    def test_preview_build_is_apk_only(self):
        from pathlib import Path
        import yaml
        root=Path(__file__).resolve().parents[2]
        jobs=yaml.safe_load((root/'.github/workflows/android-preview-delivery.yml').read_text())['jobs']
        steps={s['name']:s for s in jobs['build-preview']['steps']}
        self.assertEqual(steps['Build production-configured PR APK']['run'], 'bash scripts/build-android-release.sh apk')
        self.assertNotIn('bundleRelease', yaml.safe_dump(jobs['build-preview']))
        self.assertNotIn('apk-aab', yaml.safe_dump(jobs['build-preview']))
