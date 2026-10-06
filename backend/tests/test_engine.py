"""Règles du moteur (validées avec Flexsis, voir docs/moteur.md), vérifiées sur les snapshots versionnés."""
import unittest
from datetime import timedelta

from engine.config import TODAY
from engine.scoring import HORIZON_J, LEVELS, build

FAMILIES = {"projet", "recrutement", "entreprise", "historique"}


class EngineRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.opps, cls.fx = build(real_clients=True, key_mode="entreprise", zone_context=True)

    def test_produces_alerts_of_every_level(self):
        self.assertEqual({o.level for o in self.opps}, set(LEVELS))

    def test_only_known_families(self):
        for o in self.opps:
            self.assertLessEqual(set(o.families), FAMILIES, o.key)

    def test_level_follows_family_count_and_horizon(self):
        for o in self.opps:
            near = o.window[0] <= TODAY + timedelta(days=HORIZON_J)
            n = len(o.families)
            expected = "AGIR" if n >= 3 and near else "PRÉPARER" if n >= 2 else "SURVEILLER"
            self.assertEqual(o.level, expected, o.key)

    def test_only_project_or_recruitment_creates_an_alert(self):
        for o in self.opps:
            self.assertTrue({"projet", "recrutement"} & set(o.families), o.key)

    def test_volumes_are_ranges(self):
        for o in self.opps:
            lo, mid, hi = o.need
            self.assertTrue(1 <= lo <= mid <= hi, (o.key, o.need))

    def test_every_alert_cites_a_source(self):
        for o in self.opps:
            self.assertTrue(any(s.url for s in o.signals), o.key)

    def test_sorted_by_level(self):
        ranks = [LEVELS.index(o.level) for o in self.opps]
        self.assertEqual(ranks, sorted(ranks))

    def test_build_is_deterministic(self):
        again, _ = build(real_clients=True, key_mode="entreprise", zone_context=True)
        self.assertEqual([(o.key, o.level, o.need) for o in again], [(o.key, o.level, o.need) for o in self.opps])


if __name__ == "__main__":
    unittest.main()
