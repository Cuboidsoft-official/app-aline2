import unittest
from artifact_retention import link_seconds


class RetentionTests(unittest.TestCase):
    def test_legacy_links_never_exceed_s3_maximum(self):
        self.assertEqual(link_seconds({}, 7, 0), 604800)
        with self.assertRaises(ValueError):
            link_seconds({}, 30, 0)

    def test_renewal_cannot_outlive_object(self):
        self.assertEqual(link_seconds({"retentionExpiresAt": 200000}, 7, 100000), 99940)
        self.assertEqual(link_seconds({"retentionExpiresAt": 200000}, 1, 100000), 86400)

    def test_expired_and_invalid_windows_are_rejected(self):
        for deadline in (100001, "wrong", True):
            with self.assertRaises(ValueError):
                link_seconds({"retentionExpiresAt": deadline}, 7, 100000)
