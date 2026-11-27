"""Unit tests for the vaccine-design logic in pharma_vaccine.py (no network, no database).
Run: python -m unittest test_vaccine_logic -v   (three physchem tests need Biopython and are skipped without it)"""
import math
import re
import unittest
from collections import Counter
from unittest import mock

import pharma_vaccine as v

try:
    import Bio  # noqa: F401
    HAS_BIO = True
except ImportError:  # pragma: no cover
    HAS_BIO = False

PROT = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVV" + "KK" + "GPGPG" + "EAAAK" + "HHHHHH"
STUB = lambda s: {"length": len(s)}  # noqa: E731


class CodonTables(unittest.TestCase):
    def test_genetic_code_and_usage_table(self):
        self.assertEqual((len(v.CODON_TO_AA), len(v.SENSE_CODONS), len(v.ECOLI_FREQ)), (64, 61, 64))
        c = Counter(v.CODON_TO_AA[x] for x in v.SENSE_CODONS)
        self.assertEqual((c["L"], c["S"], c["R"], c["M"], c["W"], c["I"]), (6, 6, 6, 1, 1, 3))
        self.assertEqual((v.CODON_TO_AA["TGA"], v.CODON_TO_AA["AGA"], v.CODON_TO_AA["ATG"]), ("*", "R", "M"))
        self.assertAlmostEqual(sum(v.ECOLI_FREQ.values()), 1000.0, delta=10)  # frequencies per thousand codons

    def test_clean_seq(self):
        self.assertEqual(v.clean_seq(">x\nMKT AYI\n 12 AK*", max_len=50), "MKTAYIAK")
        with self.assertRaises(ValueError):
            v.clean_seq("MKTB", max_len=50, min_len=3)
        with self.assertRaises(ValueError):
            v.clean_seq("MK", max_len=50, min_len=3)


class EpitopePredictionParsing(unittest.TestCase):
    FAKE = ("allele\tseq_num\tstart\tend\tlength\tpeptide\tpercentile_rank\n"
            "HLA-A*02:01\t1\t1\t9\t9\tAAAAAAAAA\t0.2\nHLA-A*01:01\t1\t1\t9\t9\tAAAAAAAAA\t0.8\n"
            "HLA-A*02:01\t1\t2\t10\t9\tCCCCCCCCC\t0.5\nHLA-A*02:01\t1\t3\t11\t9\tDDDDDDDDD\t5.0\n")

    def test_tcell_filtering_and_grouping(self):
        with mock.patch.object(v, "_iedb_post", return_value=self.FAKE):
            r = v.predict_tcell("I", "A" * 9 + "C" * 9 + "D" * 9, ["HLA-A*02:01", "HLA-A*01:01"], [9], "recommended", 1.0)
        self.assertEqual((r["total_rows"], r["kept_rows"]), (4, 3))
        self.assertEqual([(p["peptide"], p["n_alleles"], p["best_rank"]) for p in r["peptides"]], [("AAAAAAAAA", 2, 0.2), ("CCCCCCCCC", 1, 0.5)])

    def test_unexpected_iedb_reply_is_an_error(self):
        with self.assertRaises(RuntimeError):
            v.parse_table("Error: bad allele")

    def test_bcell_segments(self):
        seq = "MKTAYIAKQRQISFVKSHFSRQ"
        rows = [{"position": str(i + 1), "residue": seq[i], "score": "0.5", "assignment": "E" if 2 <= i <= 9 else "-"} for i in range(len(seq))]
        segs = v.bcell_segments(rows, seq)
        self.assertEqual((segs[0]["start"], segs[0]["end"], segs[0]["peptide"]), (3, 10, seq[2:10]))


class Assembly(unittest.TestCase):
    def test_layout_and_positions(self):
        with mock.patch.object(v, "physchem_profile", STUB):
            c = v.assemble_construct("APPHALS", ["ALNKVTQEL", "GIRDWHYSA"], ["KSEQLNVDAPTGRLE"], ["DNQSTEKPGV"], True, "RS09")
        self.assertEqual(c["sequence"], "APPHALSEAAAKALNKVTQELAAYGIRDWHYSAGPGPGKSEQLNVDAPTGRLEKKDNQSTEKPGVHHHHHH")
        self.assertTrue(all(c["sequence"][s["start"] - 1:s["end"]] == s["sequence"] for s in c["segments"]))
        with mock.patch.object(v, "physchem_profile", STUB):
            self.assertEqual(v.assemble_construct("", [], [], ["EEEEEEEE", "FFFFFFFF"], False)["sequence"], "EEEEEEEEKKFFFFFFFF")


class CodonOptimization(unittest.TestCase):
    def test_most_frequent_round_trip(self):
        r = v.optimize_codons(PROT, "most_frequent")
        self.assertEqual(v.translate_dna(r["cds"][:-3]), PROT)
        self.assertEqual((r["cai"], r["cds"][-3:]), (1.0, "TAA"))
        self.assertEqual(v.optimize_codons("MKTAYIAK", "most_frequent")["cds"], "ATGAAAACCGCGTATATTGCGAAATAA")

    def test_weighted_is_deterministic_per_seed(self):
        a, a2, c = (v.optimize_codons(PROT, "weighted", seed=s) for s in (7, 7, 8))
        self.assertEqual(a["cds"], a2["cds"])
        self.assertNotEqual(a["cds"], c["cds"])
        self.assertTrue(0.5 < a["cai"] < 1.0)
        self.assertEqual(v.translate_dna(a["cds"][:-3]), PROT)

    def test_start_codon_is_added(self):
        r = v.optimize_codons("AYIAKQRQISFVKS", "most_frequent")
        self.assertTrue(r["protein_used"].startswith("MA") and r["cds"].startswith("ATG"))

    def test_restriction_sites_are_removed(self):
        enz = ["EcoRI", "BamHI", "HindIII", "XhoI", "NdeI", "NcoI"]
        for strategy in ("most_frequent", "weighted"):
            r = v.optimize_codons("AAEFAAAAGSAAAAKLAAAAHM" * 2, strategy, seed=3, avoid=enz)
            for e in enz:
                self.assertNotIn(v.ENZYMES[e], r["cds"])
            self.assertEqual((v.translate_dna(r["cds"][:-3]), r["unresolved"]), (r["protein_used"], []))
        self.assertNotIn("CATATG", v.optimize_codons("AAAAHMAAAA", "most_frequent", avoid=["NdeI"])["cds"])
        self.assertNotIn("CCATGG", v.optimize_codons("AAAPWAAAA", "most_frequent", avoid=["NcoI"])["cds"])

    def test_long_runs_are_split(self):
        for p in ("MKKKKKKKK", "M" + "K" * 20, "M" + "H" * 6 + "K" * 10 + "N" * 10):
            r = v.optimize_codons(p, "most_frequent")
            self.assertIsNone(re.search(r"([ACGT])\1{7,}", r["cds"]), r["cds"])
            self.assertEqual(v.translate_dna(r["cds"][:-3]), p)

    def test_custom_table_and_rejections(self):
        table = "\n".join(f"{c.replace('T', 'U')} {f}" for c, f in v.ECOLI_FREQ.items())
        r = v.optimize_codons(PROT, "most_frequent", custom_table=table)
        self.assertEqual((r["cds"], r["host_table"]), (v.optimize_codons(PROT, "most_frequent")["cds"], "custom table"))
        for bad in ("AAA 1\nAAG 2", table.replace("GCC 24.2", "GCC -3")):
            with self.assertRaises(ValueError):
                v.optimize_codons(PROT, custom_table=bad)
        for kw in ({"strategy": "x"}, {"seed": 0}, {"stop": "TTT"}, {"avoid": ["FooI"]}):
            with self.assertRaises(ValueError):
                v.optimize_codons(PROT, **kw)


class CloningDesign(unittest.TestCase):
    def setUp(self):
        self.cds = v.optimize_codons(PROT, "weighted", seed=2, avoid=["NdeI", "XhoI", "BamHI", "HindIII"])["cds"]

    def test_ndei_shares_the_start_codon(self):
        ins = v.build_insert(self.cds, "NdeI", "XhoI")
        self.assertTrue(ins["sites_ok"])
        self.assertEqual((ins["insert"][6:12], ins["insert"][9:9 + len(self.cds)]), ("CATATG", self.cds))
        self.assertTrue(ins["insert"].endswith(self.cds + "CTCGAG" + "GCGCGC"))

    def test_generic_pair_and_feature_coordinates(self):
        ins = v.build_insert(self.cds, "BamHI", "HindIII", clamp5="TATATA")
        self.assertEqual(ins["insert"], "TATATA" + "GGATCC" + self.cds + "AAGCTT" + "GCGCGC")
        feats = {f["name"]: (f["start"], f["end"]) for f in ins["features"]}
        self.assertEqual(ins["insert"][feats["CDS"][0] - 1:feats["CDS"][1]], self.cds)
        self.assertEqual(ins["insert"][feats["HindIII site"][0] - 1:feats["HindIII site"][1]], "AAGCTT")

    def test_rejections(self):
        site_inside = "ATGGAATTCGCTTAA"
        for args in ((site_inside, "EcoRI", "XhoI"), (site_inside, "BamHI", "EcoRI"), (self.cds, "XhoI", "XhoI"), ("GCT" * 10, "NdeI", "XhoI"), (self.cds, "Nope", "XhoI"), (self.cds + "A", "BamHI", "XhoI")):
            with self.assertRaises(ValueError):
                v.build_insert(*args)
        self.assertTrue(v.build_insert(site_inside, "BamHI", "XhoI")["sites_ok"])


class PopulationCoverage(unittest.TestCase):
    FREQ = {"HLA-A*02:01": 0.30, "HLA-A*01:01": 0.10, "HLA-B*07:02": 0.12, "HLA-DRB1*03:01": 0.08}

    def test_formula(self):
        eps = [{"peptide": "AAAAAAAAA", "alleles": ["HLA-A*02:01"]}, {"peptide": "CCCCCCCCC", "alleles": ["HLA-A*02:01", "HLA-B*07:02"]}]
        r = v.coverage_from_frequencies(eps, self.FREQ)
        self.assertAlmostEqual(r["coverage_class_i"], 1 - (1 - 0.30) ** 2 * (1 - 0.12) ** 2, places=4)
        self.assertIsNone(r["coverage_class_ii"])
        self.assertEqual(v.coverage_from_frequencies([{"peptide": "X" * 9, "alleles": ["HLA-A*02:01"]}], {"HLA-A*02:01": 0.3})["coverage_combined"], 0.51)

    def test_test_sheet_example(self):
        f = {"HLA-A*02:01": 0.25, "HLA-A*01:01": 0.15, "HLA-B*07:02": 0.10}
        eps = [{"peptide": "ALNKVTQEL", "alleles": ["HLA-A*02:01"]}, {"peptide": "GIRDWHYSA", "alleles": ["HLA-A*01:01", "HLA-B*07:02"]}]
        self.assertEqual(v.coverage_from_frequencies(eps, f)["coverage_class_i"], 0.7084)

    def test_missing_and_invalid_input(self):
        r = v.coverage_from_frequencies([{"peptide": "X" * 9, "alleles": ["HLA-A*24:02"]}], {"HLA-A*02:01": 0.3})
        self.assertEqual(r["alleles_without_frequency"], ["HLA-A*24:02"])
        self.assertTrue(r["warnings"])
        for bad in ({"HLA-A*02:01": 1.4}, {"HLA-A*02:01": True}):
            with self.assertRaises(ValueError):
                v.coverage_from_frequencies([{"peptide": "X" * 9, "alleles": ["HLA-A*02:01"]}], bad)


def _place(a, b_, c, bond, ang, tor):
    ang, tor = math.radians(ang), math.radians(tor)
    sub = lambda p, q: tuple(x - y for x, y in zip(p, q))  # noqa: E731
    nrm = lambda p: tuple(x / math.sqrt(sum(y * y for y in p)) for x in p)  # noqa: E731
    bc = nrm(sub(c, b_)); n = nrm(v._cross(sub(b_, a), bc)); m = v._cross(n, bc)
    d2 = (-bond * math.cos(ang), bond * math.sin(ang) * math.cos(tor), bond * math.sin(ang) * math.sin(tor))
    return tuple(c[i] + bc[i] * d2[0] + m[i] * d2[1] + n[i] * d2[2] for i in range(3))


def build_backbone(n, phi, psi, resn="ALA", bfac=0.9):
    N0, CA0 = (0.0, 0.0, 0.0), (1.458, 0.0, 0.0)
    C0 = (CA0[0] + 1.525 * math.cos(math.radians(180 - 111.2)), 1.525 * math.sin(math.radians(180 - 111.2)), 0.0)
    res = [(N0, CA0, C0)]
    for _ in range(n - 1):
        a, b_, c = res[-1]
        Nn = _place(a, b_, c, 1.329, 116.2, psi); CAn = _place(b_, c, Nn, 1.458, 121.7, 180.0); Cn = _place(c, Nn, CAn, 1.525, 111.2, phi)
        res.append((Nn, CAn, Cn))
    lines, i = [], 1
    for k, trio in enumerate(res, 1):
        for nm, p in zip(("N", "CA", "C"), trio):
            lines.append(f"ATOM  {i:5d} {nm:<4s}{resn:>4s} A{k:4d}    {p[0]:8.3f}{p[1]:8.3f}{p[2]:8.3f}  1.00{bfac:6.2f}           {nm[0]}")
            i += 1
    return "\n".join(lines)


class StructureAnalysis(unittest.TestCase):
    def test_helix_strand_and_bad_geometry(self):
        helix = v.structure_qc(build_backbone(20, -57, -47, bfac=0.92), bfactor_is_plddt=True)
        self.assertEqual((helix["ramachandran"]["evaluated"], helix["ramachandran"]["favored_pct"]), (18, 100.0))
        self.assertEqual((helix["plddt"]["mean"], helix["plddt"]["scale_factor"], helix["plddt"]["very_high_gt90"]), (92.0, 100.0, 100.0))
        strand = v.structure_qc(build_backbone(20, -120, 130, bfac=0.40), bfactor_is_plddt=True)
        self.assertEqual((strand["ramachandran"]["favored_pct"], strand["plddt"]["very_low_le50"]), (100.0, 100.0))
        bad = v.structure_qc(build_backbone(12, 60, -120))
        self.assertEqual(bad["ramachandran"]["outlier_pct"], 100.0)
        self.assertNotIn("plddt", bad)

    @staticmethod
    def atom(i, name, resn, ch, resi, x, y, z, el):
        return f"ATOM  {i:5d} {name:<4s}{resn:>4s} {ch}{resi:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00 20.00           {el}"

    def test_interface_analysis(self):
        a = self.atom
        cx = "\n".join([a(1, "CA", "ALA", "A", 1, 0, 0, 0, "C"), a(2, "OD1", "ASP", "A", 2, 10, 0, 0, "O"), a(3, "N", "GLY", "A", 3, 0, 20, 0, "N"),
                        a(4, "NZ", "LYS", "B", 5, 13.0, 0, 0, "N"), a(5, "CA", "ALA", "B", 6, 0, 3.8, 0, "C"), a(6, "CA", "TRP", "C", 7, 60, 60, 60, "C")])
        r = v.interface_analysis(cx, ["A"], ["B"], 5.0)
        self.assertEqual((r["residue_pairs_in_contact"], r["n_polar_contacts"], len(r["salt_bridge_candidates"])), (2, 1, 1))
        self.assertEqual(r["interface_residues_a"], ["A:ALA1", "A:ASP2"])
        self.assertEqual(v.interface_analysis(cx, ["A"], ["B", "C"], 5.0)["residue_pairs_in_contact"], 2)
        for args in ((["A"], ["A"]), (["A"], ["Z"]), ([], ["B"])):
            with self.assertRaises(ValueError):
                v.interface_analysis(cx, *args)


@unittest.skipUnless(HAS_BIO, "Biopython is not installed")
class PhysicochemicalProfile(unittest.TestCase):
    SEQ = "MKTAYIAKQRQISFVKSHFSRQ"
    KD = dict(A=1.8, R=-4.5, N=-3.5, D=-3.5, C=2.5, Q=-3.5, E=-3.5, G=-0.4, H=-3.2, I=4.5, L=3.8, K=-3.9, M=1.9, F=2.8, P=-1.6, S=-0.8, T=-0.7, W=-0.9, Y=-1.3, V=4.2)

    def test_values_match_independent_formulas(self):
        p = v.physchem_profile(self.SEQ)
        n = len(self.SEQ)
        self.assertEqual(p["length"], n)
        self.assertAlmostEqual(p["gravy"], sum(self.KD[x] for x in self.SEQ) / n, delta=0.002)
        ai = (self.SEQ.count("A") + 2.9 * self.SEQ.count("V") + 3.9 * (self.SEQ.count("I") + self.SEQ.count("L"))) / n * 100
        self.assertAlmostEqual(p["aliphatic_index"], ai, delta=0.01)
        self.assertEqual((p["negative_residues_DE"], p["positive_residues_RK"]), (sum(self.SEQ.count(x) for x in "DE"), sum(self.SEQ.count(x) for x in "RK")))

    def test_plausible_ranges(self):
        p = v.physchem_profile(self.SEQ)
        self.assertTrue(2.0 < p["molecular_weight_kda"] < 3.5)
        self.assertTrue(3.0 < p["theoretical_pi"] < 13.0)
        self.assertIn(p["instability_class"], ("stable", "unstable"))
        self.assertEqual(p["n_terminal_residue"], "M")

    def test_rejects_nonstandard_residues(self):
        with self.assertRaises(ValueError):
            v.physchem_profile("MKTBXZ")


if __name__ == "__main__":
    unittest.main()
