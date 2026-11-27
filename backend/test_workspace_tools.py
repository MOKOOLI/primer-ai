"""Unit tests for workspace_tools.py: dossier integrity, methods text, challenge scoring, trial landscape.
Run: python -m unittest test_workspace_tools -v   (no network, no database)"""
import unittest
from unittest import mock

import bio_tools
import pharma_vaccine as v
import workspace_tools as w

PROT = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVV"


class DossierIntegrity(unittest.TestCase):
    def test_hash_ignores_key_order_but_not_content(self):
        a = {"sections": [{"kind": "note", "title": "t", "text": "x", "data": {"b": 1, "a": [1, 2]}, "added_at": ""}]}
        b = {"sections": [{"added_at": "", "data": {"a": [1, 2], "b": 1}, "text": "x", "title": "t", "kind": "note"}]}
        self.assertEqual(w.content_hash(a), w.content_hash(b))
        self.assertEqual(len(w.content_hash(a)), 64)
        self.assertNotEqual(w.content_hash(a), w.content_hash({"sections": [{**a["sections"][0], "text": "y"}]}))

    def test_documented_example_hash(self):
        """The hash quoted in the test sheet for a single English note section 'hello'."""
        content = {"sections": w.clean_sections([{"kind": "note", "title": "Note", "text": "hello"}])}
        self.assertEqual(w.canonical_json(content), '{"sections":[{"added_at":"","data":{},"kind":"note","text":"hello","title":"Note"}]}')
        self.assertEqual(w.content_hash(content), "3bf4132ed7aa10440a2e631242a6548a89651d968f01275d27afc4a706fc6726")

    def test_section_cleaning(self):
        s = w.clean_sections([{"kind": "bogus", "title": "Z" * 500, "data": {"k": 1}}])
        self.assertEqual((s[0]["kind"], len(s[0]["title"])), ("note", 160))
        for bad in ([], "x", [1], [{"kind": "note", "data": "str"}], [{"kind": "note"}] * 61, [{"kind": "note", "text": "x" * 60000}] * 40):
            with self.assertRaises(ValueError):
                w.clean_sections(bad)


class MethodsAndChecklist(unittest.TestCase):
    SECS = [
        {"kind": "uniprot", "title": "Target", "data": {"accession": "P0DTC9", "name": "Nucleoprotein", "organism": "SARS-CoV-2", "length": 419, "retrieved_at": "2026-11-20T10:00:00+00:00"}},
        {"kind": "tcell", "title": "MHC-I", "data": {"mhc_class": "I", "method": "recommended", "cutoff": 1.0, "alleles": ["A", "B", "C"], "kept_rows": 40, "total_rows": 1000, "provenance": {"retrieved_at": "2026-11-20T11:00:00+00:00"}}},
        {"kind": "codon", "title": "Codon", "data": {"host_table": "Escherichia coli", "strategy": "weighted", "seed": 1, "cai": 0.78, "gc_percent": 52.1, "avoided_enzymes": ["NdeI", "XhoI"]}},
        {"kind": "standard_curve", "title": "SC", "data": {"slope": -3.32, "r_squared": 0.999, "efficiency_percent": 100.1}},
        {"kind": "note", "title": "free text", "text": "hello"},
        {"kind": "genorm", "title": "malformed", "data": {"ranking_most_to_least_stable": "oops"}},
    ]

    def test_methods_use_only_recorded_facts(self):
        m = w.generate_methods(self.SECS)
        for expected in ("P0DTC9", "accessed 2026-11-20", "40 of 1000", "NdeI, XhoI", "100.1%", "hypotheses that require experimental validation"):
            self.assertIn(expected, m["text"])
        self.assertNotIn("free text", m["sections_without_methods_text"])
        self.assertEqual(w.generate_methods([{"kind": "note", "title": "n", "text": "t"}])["text"], "")

    def test_checklist_is_a_documentation_aid(self):
        c = w.miqe_checklist(self.SECS)
        status = {i["item"]: i["status"] for i in c["items"]}
        self.assertEqual(status["Standard curve / amplification efficiency"], "documented")
        self.assertEqual(status["Reference-gene stability assessed"], "documented")
        self.assertEqual(status["Primer sequences and amplicon details"], "not documented")
        self.assertIn("not a MIQE compliance certificate", c["note"])


class ChallengeScoring(unittest.TestCase):
    def test_codon_challenge(self):
        cfg = w.validate_challenge_config("codon", {"protein": PROT, "forbidden_sites": ["NdeI", "XhoI", "Nope"], "gc_min": 40, "gc_max": 60})
        self.assertEqual(cfg["forbidden_sites"], ["NdeI", "XhoI"])
        best = v.optimize_codons(PROT, "most_frequent", avoid=["NdeI", "XhoI"])["cds"]
        s = w.score_codon(cfg, {"cds": best})
        self.assertTrue(s["valid"])
        self.assertEqual((s["parts"]["cai"], s["parts"]["sites"], s["parts"]["runs"]), (50.0, 20.0, 10.0))
        self.assertFalse(w.score_codon(cfg, {"cds": "ATG" + best[3:-3][:-3]})["valid"])  # wrong protein
        self.assertFalse(w.score_codon(cfg, {"cds": "ATGXXX"})["valid"])
        self.assertFalse(w.score_codon(cfg, {"cds": best[:-1]})["valid"])

    def test_documented_codon_example(self):
        prot = "MKTAYIAKQRQISFVKSHFSRQLE"
        cfg = w.validate_challenge_config("codon", {"protein": prot, "forbidden_sites": ["NdeI", "XhoI"], "gc_min": 40, "gc_max": 60})
        cds = "ATGAAAACCGCGTATATTGCGAAACAGCGTCAGATTAGCTTTGTGAAAAGCCATTTTAGCCGTCAGCTGGAATAA"
        self.assertEqual(w.score_codon(cfg, {"cds": cds})["score"], 100.0)
        self.assertEqual(w.score_codon(cfg, {"cds": cds.replace("GCG", "GCC", 1)})["score"], 99.55)
        self.assertEqual(w.score_codon(cfg, {"cds": cds[:-6] + "TAA"})["valid"], False)

    def test_forbidden_site_costs_points(self):
        cfg = w.validate_challenge_config("codon", {"protein": "MAAAAHMAAAAAAAAAAAAAAA", "forbidden_sites": ["NdeI"]})
        r = w.score_codon(cfg, {"cds": "ATG" + "GCT" * 4 + "CATATG" + "GCT" * 15 + "TAA"})
        self.assertTrue(r["valid"])
        self.assertEqual((r["parts"]["sites"], r["metrics"]["forbidden_sites_found"]), (0.0, 1))

    def test_construct_challenge(self):
        refs = [PROT + "AAAA", PROT[:-5] + "GGGGG", PROT]
        cfg = w.validate_challenge_config("construct", {"references": refs, "min_epitopes": 2, "max_epitopes": 6, "length_max": 300})
        ep1, ep2 = PROT[10:19], PROT[30:39]
        construct = "APPHALS" + "EAAAK" + ep1 + "AAY" + ep2 + "HHHHHH"
        with mock.patch.object(w, "physchem_profile", lambda s: {"instability_index": 30.0, "gravy": -0.2}):
            self.assertEqual(w.score_construct(cfg, {"construct": construct, "epitopes": [ep1, ep2]})["score"], 100.0)
            weak = w.score_construct(cfg, {"construct": construct + PROT[-9:], "epitopes": [ep1, PROT[-9:]]})
            self.assertTrue(0 < weak["parts"]["conservancy"] < 45)
            self.assertFalse(w.score_construct(cfg, {"construct": construct, "epitopes": ["WWWWWWWWW"]})["valid"])
            self.assertFalse(w.score_construct(cfg, {"construct": construct + "A" * 400, "epitopes": [ep1]})["valid"])
            self.assertEqual(w.score_construct(cfg, {"construct": construct, "epitopes": [ep1]})["parts"]["epitope_count"], 0.0)
        with mock.patch.object(w, "physchem_profile", lambda s: {"instability_index": 60.0, "gravy": 0.5}):
            p = w.score_construct(cfg, {"construct": construct, "epitopes": [ep1, ep2]})["parts"]
            self.assertEqual((p["stability"], p["hydropathy"]), (12.5, 7.5))

    def test_invalid_configs(self):
        for kind, cfg in (("codon", {"protein": "MK"}), ("construct", {"references": []}), ("unknown", {})):
            with self.assertRaises(ValueError):
                w.validate_challenge_config(kind, cfg)

    def test_leaderboard_best_per_user_ties_to_earliest(self):
        rows = [{"user_id": 1, "label": "A", "score": 80.0, "ts": 5}, {"user_id": 1, "label": "A", "score": 90.0, "ts": 9},
                {"user_id": 2, "label": "B", "score": 90.0, "ts": 3}, {"user_id": 3, "label": "C", "score": 50.0, "ts": 1}]
        board = w.leaderboard(rows)
        self.assertEqual([(r["rank"], r["label"]) for r in board], [(1, "B"), (2, "A"), (3, "C")])

    def test_equal_scores_by_one_user_keep_the_earliest_submission(self):
        rows = [{"user_id": 4, "label": "D", "score": 70.0, "ts": 10}, {"user_id": 4, "label": "D", "score": 70.0, "ts": 2}, {"user_id": 5, "label": "E", "score": 70.0, "ts": 6}]
        board = w.leaderboard(rows)
        self.assertEqual([(r["label"], r["ts"]) for r in board], [("D", 2), ("E", 6)])


class TrialLandscape(unittest.TestCase):
    @staticmethod
    def study(n, phases, status, sponsor, cls, start, enrol, interventions):
        return {"protocolSection": {"identificationModule": {"nctId": n, "briefTitle": "T" + n}, "statusModule": {"overallStatus": status, "startDateStruct": {"date": start}},
                                    "designModule": {"phases": phases, "enrollmentInfo": {"count": enrol}}, "sponsorCollaboratorsModule": {"leadSponsor": {"name": sponsor, "class": cls}},
                                    "armsInterventionsModule": {"interventions": [{"name": i} for i in interventions]}}}

    def setUp(self):
        s = self.study
        self.studies = [s("NCT1", ["PHASE2"], "COMPLETED", "Acme", "INDUSTRY", "2019-03", 100, ["DrugA"]),
                        s("NCT2", ["PHASE1", "PHASE2"], "RECRUITING", "Acme", "INDUSTRY", "2022-05-10", 60, ["DrugA", "Placebo"]),
                        s("NCT3", ["PHASE3"], "COMPLETED", "Univ X", "OTHER", "2019-11", 400, ["DrugB"]),
                        {"protocolSection": {"identificationModule": {"nctId": "NCT4"}, "designModule": {}}}, {"protocolSection": {}}]

    def test_aggregation_survives_sparse_records(self):
        a = w.aggregate_studies(self.studies)
        self.assertEqual(a["n_analysed"], 4)
        self.assertEqual(a["by_phase"], {"PHASE2": 1, "PHASE1/PHASE2": 1, "PHASE3": 1, "NA": 1})
        self.assertEqual(a["by_start_year"], {"2019": 2, "2022": 1})
        self.assertEqual(a["top_sponsors"][0], {"name": "Acme", "studies": 2})
        self.assertEqual((a["median_enrollment"], a["studies"][0]["url"]), (100, "https://clinicaltrials.gov/study/NCT1"))

    def test_query_building_and_validation(self):
        seen = {}

        def fake_get(url, params=None, **kw):
            seen.update(params or {})
            return {"totalCount": 321, "studies": self.studies}

        with mock.patch.object(bio_tools, "_get", side_effect=fake_get):
            r = w.trial_landscape("breast cancer", "", "HER2")
            self.assertEqual((r["total"], r["sampled"]), (321, 5))
            self.assertEqual((seen["query.cond"], seen["query.term"], seen["pageSize"]), ("breast cancer", "HER2", 150))
            self.assertNotIn("query.intr", seen)
            self.assertIn("no attractiveness", r["limits"])
            for args in (("", "", ""), ("x" * 200, "", ""), ("a\x00b", "", "")):
                with self.assertRaises(ValueError):
                    w.trial_landscape(*args)


if __name__ == "__main__":
    unittest.main()
