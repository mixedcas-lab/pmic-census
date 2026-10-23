"""Offline tests: python3 -m unittest discover -s collector -v"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402
import classify as C  # noqa: E402


class TestRelevance(unittest.TestCase):
    def test_core(self):
        for t in ("A 96.1% Efficiency 48V-to-1V GaN Power Converter with Full-Wave Temperature-Compensated Current Sensing",
                  "A Fully Integrated Li-Ion-Compatible Hybrid Four-Level DC–DC Converter in 28-nm FDSOI",
                  "A Li-Ion Battery Charger With Smooth Control Circuit and Built-In Resistance Compensator",
                  "A Synchronized Switch Harvesting Rectifier With Reusable Storage Capacitors for Piezoelectric Energy Harvesting"):
            self.assertEqual(C.relevance(t, ""), "core", t)

    def test_not_pmic(self):
        for t in ("A Universal Vector Controller for Four-Quadrant Three-Phase Power Converters",
                  "A 0.6-V LDO With Fast Transient Response"):
            self.assertIsNone(C.relevance(t, ""), t)


class TestSpecs(unittest.TestCase):
    def test_title(self):
        s = C.parse_specs("A 96.1% Efficiency 48V-to-1V GaN Power Converter", "")
        self.assertEqual((s["eff"], s["vin"], s["vout"]), (96.1, 48.0, 1.0))
        self.assertEqual(C.parse_specs("730-790mA/mm2 48V-to-1V Integrated Hybrid DC-DC Converters", "")["cd"], 0.79)
        self.assertEqual(C.parse_specs("A Fully Integrated Buck Regulator With 2-GHz Resonant Switching", "")["fsw"], 2e9)

    def test_abstract(self):
        a = ("The converter delivers a maximum load current of 1.2 A with a peak efficiency of 88.5% from a 1.8 V input to "
             "0.9 V output in 65-nm CMOS with a 4.7 nH inductor. Output ripple is 12 mV.")
        s = C.parse_specs("A 4-Phase 30–70 MHz Switching Frequency Buck Converter", a)
        self.assertEqual((s["eff"], s["iout"], s["vin"], s["vout"], s["fsw"]), (88.5, 1.2, 1.8, 0.9, 7e7))
        self.assertEqual((s["ind"], s["ripple"], s["node"]), (4.7e-9, 0.012, 65))
        self.assertEqual(C.derived(s)["cr"], 0.5)

    def test_type_and_arch(self):
        self.assertEqual(C.pmic_type("A Fully Integrated Hybrid Four-Level DC–DC Converter", ""), "Hybrid")
        self.assertEqual(C.pmic_type("A Switched-Capacitor DC-DC Converter With Soft VCR Transitions", ""), "Switched-capacitor")
        self.assertEqual(C.pmic_type("A Peak-Valley Current-Mode Buck Converter", ""), "Inductive")
        self.assertIn("Multi-level", C.architectures("A Hybrid Four-Level DC–DC Converter", ""))
        self.assertIn("Boost", C.architectures("A 4–40 V Wide Input Range Boost Converter", ""))
        self.assertNotIn("Boost", C.architectures("A Single-Mode Dual-Path Buck-Boost Converter", ""))


class TestBuild(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.saved = {k: getattr(build, k) for k in ("DATA", "PAPERS", "META")}
        build.DATA = os.path.join(self.tmp, "data")
        build.PAPERS = os.path.join(build.DATA, "papers.json")
        build.META = os.path.join(build.DATA, "meta.json")
        os.makedirs(build.DATA)
        self.cache = os.path.join(self.tmp, "cache")
        os.makedirs(self.cache)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(build, k, v)
        shutil.rmtree(self.tmp)

    def put(self, n, title, pub, abstract="", year=2025):
        with open(os.path.join(self.cache, "%d.json" % n), "w", encoding="utf-8") as f:
            json.dump({"article_number": n, "title": title, "publication_title": pub, "abstract": abstract,
                       "publication_year": year, "publication_date": "Feb. %d" % year, "doi": "10.1109/x.%d" % n,
                       "authors": {"authors": [{"full_name": "A. Kim", "author_order": 1,
                                                "affiliation": "KAIST, Daejeon, South Korea"}]}}, f)

    def test_rebuild(self):
        config = build.load_json(build.CONFIG, None)
        self.put(1, "A 93% Peak Efficiency 3-Level Buck Converter", "IEEE Journal of Solid-State Circuits", "It delivers up to 2 A.")
        self.put(2, "A 12-b SAR ADC", "IEEE Journal of Solid-State Circuits")
        self.put(3, "A Dickson Switched-Capacitor DC-DC Converter", "2025 IEEE Custom Integrated Circuits Conference (CICC)")
        self.put(4, "A 1-A Buck Converter", "Some Other Conference")
        self.put(5, "An IoT Sensor Node SoC With an Integrated Buck Converter", "IEEE Journal of Solid-State Circuits", "It draws 5 mA.")
        meta = build.rebuild(config, self.cache, "2026-10-23")
        papers = {p["id"]: p for p in build.load_json(build.PAPERS, [])}
        self.assertEqual(set(papers), {"1", "3", "5"})
        self.assertEqual((papers["1"]["ty"], papers["1"]["s"]["eff"], papers["1"]["s"]["iout"]), ("Hybrid", 93.0, 2.0))
        self.assertEqual(papers["3"]["ty"], "Switched-capacitor")
        self.assertEqual((papers["5"]["lv"], papers["5"]["s"], papers["5"]["sys"]), ("related", {}, True))
        self.assertNotIn("abstract", json.dumps(list(papers.values())))
        self.assertEqual((meta["core"], meta["last_run_new"]), (2, 0))


if __name__ == "__main__":
    unittest.main()
