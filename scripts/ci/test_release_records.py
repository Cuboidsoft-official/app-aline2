import os
import subprocess
import tempfile
import unittest
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[2]


class ReleaseRecords(unittest.TestCase):
    def setUp(self):
        jobs=yaml.safe_load((ROOT/'.github/workflows/android-release-delivery.yml').read_text())['jobs']
        self.resolve_script=next(s['run'] for s in jobs['redeliver']['steps'] if s['name']=='Resolve the requested release')
        self.probe=next(s['run'] for s in jobs['health']['steps'] if s['name']=='Prove a signed download still works end to end')

    def resolve(self, prefix, name):
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder,'output')
            env=dict(os.environ,RELEASE_PREFIX=prefix,RELEASE_NAME=name,GITHUB_OUTPUT=str(output))
            result=subprocess.run(['bash','-c',self.resolve_script],env=env,capture_output=True,text=True)
            return result.returncode,output.read_text() if output.exists() else ''

    def test_existing_date_only_selection_is_preserved(self):
        code,out=self.resolve('20261006','')
        self.assertEqual(code,0)
        self.assertEqual(out,'folder=android/private/20261006\n')

    def test_same_day_releases_resolve_to_distinct_immutable_records(self):
        values=[]
        for number in (160,166):
            name=f'Aline2-v2.3.0-20261006-b149d55-r{number}-a1'
            code,out=self.resolve('20261006',name)
            self.assertEqual(code,0)
            self.assertEqual(out,f'folder=android/private/expiring/records/{name}\n')
            values.append(out)
        self.assertNotEqual(*values)

    def test_invalid_date_path_and_mismatched_name_write_no_output(self):
        for prefix,name in [('20261006','../other'),('20261006','name\nfolder=other'),
                            ('../other',''),('20261005','Aline2-v2.3.0-20261006-b149d55-r160-a1')]:
            code,out=self.resolve(prefix,name)
            self.assertNotEqual(code,0)
            self.assertEqual(out,'')

    def test_sentinel_refresh_occurs_only_after_fetch_comparison(self):
        compare=self.probe.index('cmp -s /tmp/sentinel.json /tmp/probe.out')
        refresh=self.probe.index('aws s3 cp /tmp/sentinel.json "${sentinel}"')
        self.assertGreater(refresh,compare)
        self.assertIn('exit 1',self.probe[compare:refresh])

    def test_producer_writes_per_release_record_before_latest_pointer(self):
        workflow=(ROOT/'.github/workflows/android-apk.yml').read_text()
        exact=workflow.index('/expiring/records/${{ steps.meta.outputs.release_name }}/release.json')
        latest=workflow.index('/android/private/${{ steps.meta.outputs.release_date }}/release.json')
        self.assertLess(exact,latest)
