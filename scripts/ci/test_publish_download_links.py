import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import publish_production_links as production
import publish_preview as preview


class DownloadLinks(unittest.TestCase):
    def test_production_attaches_links_to_the_exact_merged_pr(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder, 'out')
            env = {'REPO':'owner/repo','SHA':'abc','RELEASE_NAME':'release', 'APK_URL':'https://example/apk',
                   'AAB_URL':'https://example/aab','EXPIRES':'tomorrow','ARTIFACT_URL':'https://github.com/artifact',
                   'GITHUB_OUTPUT':str(output)}
            responses = [[{'number':65,'merged_at':'today','merge_commit_sha':'abc','base':{'ref':'main'}}],
                         {'html_url':'https://github.com/owner/repo/pull/65#issuecomment-1'}]
            with patch.dict(os.environ,env), patch.object(production,'api',side_effect=responses) as api:
                production.main()
            self.assertIn('https://example/apk',api.call_args.args[1]['body'])
            self.assertEqual(output.read_text(),'comment_url=https://github.com/owner/repo/pull/65#issuecomment-1\n')

    def test_ambiguous_and_unrelated_commit_never_gets_a_comment(self):
        with patch.dict(os.environ,{'REPO':'owner/repo','SHA':'abc'}):
            for candidates in ([],[{'number':65,'merged_at':'today','merge_commit_sha':'other','base':{'ref':'main'}}]):
                with patch.object(production,'api',return_value=candidates) as api:
                    production.main()
                    self.assertEqual(api.call_count,1)

    def test_preview_summary_links_to_comment_not_a_redacted_signed_url(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'preview').mkdir()
            (root/'preview/Aline2-PR-test.apk').write_bytes(b'verified-apk-fixture')
            env={'REPO':'owner/repo','PR':'67','SHA':'abc','VERSION':'100163','PRIVATE_RELEASES_BUCKET':'aline2-release-artifacts-497172038254',
                 'GITHUB_RUN_ID':'1','GITHUB_RUN_ATTEMPT':'1','ARTIFACT_URL':'https://github.com/artifact','GITHUB_STEP_SUMMARY':str(root/'summary')}
            current={'state':'open','head':{'sha':'abc'}}
            def command(*args):
                if args[:3]==('aws','sts','get-caller-identity'):
                    return json.dumps({'Account':'497172038254','Arn':'arn:aws:iam::497172038254:user/aline2-android-release-ci'})
                if args[:3]==('aws','s3','presign'): return 'https://example/apk?X-Amz-Credential=credential-id'
                if args[0]=='curl': return '206'
                if args[:2]==('gh','api'): return json.dumps({'html_url':'https://github.com/owner/repo/pull/67#issuecomment-1'})
                raise AssertionError(args)
            original=Path.cwd()
            try:
                os.chdir(root)
                with patch.dict(os.environ,env),patch.object(preview,'api',return_value=current),patch.object(preview,'command',side_effect=command),patch.object(preview.subprocess,'run'):
                    preview.main()
            finally: os.chdir(original)
            summary=(root/'summary').read_text()
            self.assertIn('issuecomment-1',summary)
            self.assertNotIn('X-Amz-Credential',summary)
            comment=json.loads(Path('/tmp/preview-comment.json').read_text())['body']
            self.assertIn('X-Amz-Credential=credential-id',comment)
