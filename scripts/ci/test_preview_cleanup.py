import json
import unittest
from unittest.mock import patch
from cleanup_preview_input import cleanup


class PreviewCleanup(unittest.TestCase):
    def test_only_this_run_named_input_is_deleted(self):
        artifacts={'artifacts':[{'id':1,'name':'pr-preview-input','expired':False},
                                 {'id':2,'name':'developer-release','expired':False},
                                 {'id':3,'name':'pr-preview-input','expired':True}]}
        with patch('cleanup_preview_input.subprocess.check_output',return_value=json.dumps(artifacts)) as read, patch('cleanup_preview_input.subprocess.run') as delete:
            self.assertEqual(cleanup('owner/repo','123'),1)
            self.assertEqual(read.call_args.args[0][-1],'repos/owner/repo/actions/runs/123/artifacts')
            self.assertEqual(delete.call_args.args[0][-1],'repos/owner/repo/actions/artifacts/1')
            self.assertTrue(delete.call_args.kwargs['check'])

    def test_missing_input_never_deletes_anything(self):
        with patch('cleanup_preview_input.subprocess.check_output',return_value='{"artifacts":[]}'), patch('cleanup_preview_input.subprocess.run') as delete:
            self.assertEqual(cleanup('owner/repo',123),0)
            delete.assert_not_called()
