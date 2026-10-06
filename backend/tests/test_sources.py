"""Snapshots et référentiels : format commun des records, jointure des communes, détection des métiers."""
import unittest

from sources import SOURCES, communes, load, metiers, path

RECORD_KEYS = {"source", "id", "kind", "date", "title", "text", "url", "canton", "commune", "bfs", "company",
               "lat", "lon", "extra"}


class SnapshotsTest(unittest.TestCase):
    def test_every_source_has_a_snapshot(self):
        missing = [n for n in SOURCES if not path(n).exists()]
        self.assertEqual(missing, [], "snapshots manquants dans data/snapshots/")

    def test_records_follow_the_common_format(self):
        for name in SOURCES:
            with self.subTest(source=name):
                recs = load(name)
                self.assertTrue(recs, "snapshot vide")
                for r in recs[:50]:
                    self.assertLessEqual(RECORD_KEYS, set(r), r.get("id"))
                    self.assertEqual(r["source"], name)

    def test_simulated_data_is_flagged(self):
        for name in (n for n in SOURCES if n.startswith("fx_")):
            with self.subTest(source=name):
                self.assertTrue(all(r["extra"].get("fictif") for r in load(name)))


class ReferentielsTest(unittest.TestCase):
    def test_commune_lookup_by_name_and_alias(self):
        idx = communes.index()
        self.assertEqual(communes.lookup("Sierre", idx)["extra"]["district"], "District de Sierre")
        self.assertIsNotNone(communes.lookup("Verbier", idx), "alias de localité")

    def test_trade_detection(self):
        self.assertIn("macon", metiers.detect("Maçon CFC (h/f)"))
        self.assertEqual(metiers.detect("Comptable"), [])


if __name__ == "__main__":
    unittest.main()
