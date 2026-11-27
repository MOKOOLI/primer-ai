"""Unit tests for bio_tools.py (no network, no database). Run: python -m unittest test_bio_tools -v"""
import math
import unittest
from unittest import mock

import bio_tools as b
from pharma_vaccine import revcomp


class SequenceTools(unittest.TestCase):
    def test_orf_both_strands(self):
        seq = "CCC" + "ATG" + "GCT" * 60 + "TAA" + "GGG"
        o = b.analyze_sequence(seq, min_orf_aa=50)["orfs"][0]
        self.assertEqual((o["strand"], o["start"], o["end"], o["length_aa"]), ("+", 4, 189, 61))
        self.assertEqual(o["protein"], "M" + "A" * 60)
        rc = b.analyze_sequence(revcomp(seq), min_orf_aa=50)["orfs"][0]
        self.assertEqual((rc["strand"], rc["start"], rc["end"], rc["length_aa"]), ("-", 4, 189, 61))

    def test_short_orf_example_from_the_test_sheet(self):
        o = b.analyze_sequence("CCCATGGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTGCTTAAGGG", min_orf_aa=10)["orfs"][0]
        self.assertEqual((o["strand"], o["start"], o["end"], o["length_aa"], o["protein"]), ("+", 4, 45, 13, "M" + "A" * 12))

    def test_restriction_digest_fragments(self):
        r = b.analyze_sequence("A" * 30 + "GAATTC" + "A" * 64, digest=["EcoRI"])
        self.assertEqual(r["restriction"]["sites"]["EcoRI"]["positions"], [31])
        self.assertEqual(r["digest"]["fragments_bp"], [31, 69])
        self.assertIn("EcoRI", r["restriction"]["unique_cutters"])
        t = "G" * 10 + "CATATG" + "G" * 20 + "CTCGAG" + "G" * 10  # NdeI cuts after 12, XhoI after 37
        self.assertEqual(b.analyze_sequence(t, digest=["NdeI", "XhoI"])["digest"]["fragments_bp"], [12, 25, 15])

    def test_basic_values_and_validation(self):
        self.assertEqual(b.analyze_sequence("ATGC" * 5)["basic_tm_c"], round(64.9 + 41 * (10 - 16.4) / 20, 1))
        self.assertEqual(b.analyze_sequence("ACGTACGTAC")["reverse_complement"], revcomp("ACGTACGTAC"))
        for bad in ("ACGTNNNN" * 3, "ACG"):
            with self.assertRaises(ValueError):
                b.analyze_sequence(bad)
        with self.assertRaises(ValueError):
            b.analyze_sequence("ACGT" * 10, digest=["NotAnEnzyme"])


class AlignmentAndConservancy(unittest.TestCase):
    SEQS = ["MKTAYIAKQRQISFVKSHFSRQ", "MKTAYIAKQRQISFVKSHFSRQ", "MKTAYIAKQRQLSFVKSHFSRQ", "MKTAYIAKQRQISFVKSGGHFSRQ"]

    def test_pairwise_keeps_residues(self):
        a, c = b.nw_align("ACGTACGTAA", "ACGTCGTAA")
        self.assertEqual(len(a), len(c))
        self.assertEqual((a.replace("-", ""), c.replace("-", "")), ("ACGTACGTAA", "ACGTCGTAA"))

    def test_msa_rows_equal_length_and_lossless(self):
        rows = b.center_star_msa(self.SEQS)
        self.assertEqual(len({len(r) for r in rows}), 1)
        self.assertEqual([r.replace("-", "") for r in rows], self.SEQS)

    def test_published_example_values(self):
        fasta = "\n".join(f">s{i + 1}\n{s}" for i, s in enumerate(self.SEQS))
        r = b.align_and_conserve(fasta, "protein")
        self.assertEqual(r["mean_identity"], 0.927)
        self.assertEqual((r["fully_conserved_columns"], r["alignment_length"]), (21, 24))
        self.assertEqual(r["conserved_windows"][0], {"alignment_start": 1, "alignment_end": 11, "length": 11, "peptide": "MKTAYIAKQRQ"})

    def test_needs_two_sequences(self):
        with self.assertRaises(ValueError):
            b.align_and_conserve(">a\nMKTAYIAKQR", "protein")

    def test_epitope_conservancy(self):
        fa = ">s1\nAAAMKTAYIAKQRAAA\n>s2\nGGGMKTAYIAKQRGGG\n>s3\nCCCMKTAYLAKQRCCC\n>s4\nWWWWWWWWWWWWWWWWW"
        r = b.epitope_conservancy(["MKTAYIAKQR"], fa)["results"][0]
        self.assertEqual((r["exact_count"], r["exact_percent"], r["within_1_mismatch_count"], r["within_1_mismatch_percent"]), (2, 50.0, 3, 75.0))
        with self.assertRaises(ValueError):
            b.epitope_conservancy(["ACD"], fa)


class QpcrTools(unittest.TestCase):
    def test_standard_curve_perfect(self):
        pts = [{"quantity": q, "ct": 40 - 3.3219 * math.log10(q)} for q in (10, 100, 1e3, 1e4, 1e5)]
        r = b.standard_curve(pts)
        self.assertAlmostEqual(r["efficiency_percent"], 100.0, delta=0.2)
        self.assertEqual(r["r_squared"], 1.0)
        self.assertEqual(r["flags"], [])

    def test_standard_curve_test_sheet_values(self):
        pts = [(100000, 23.39), (10000, 26.712), (1000, 30.034), (100, 33.356), (10, 36.678)]
        r = b.standard_curve([{"quantity": q, "ct": c} for q, c in pts])
        self.assertAlmostEqual(r["slope"], -3.322, places=3)
        self.assertAlmostEqual(r["efficiency_percent"], 100.0, delta=0.2)
        self.assertEqual(r["flags"], [])

    def test_standard_curve_flags_and_errors(self):
        flags = b.standard_curve([{"quantity": q, "ct": 40 - 3.0 * math.log10(q)} for q in (10, 100, 1e3)])["flags"]
        self.assertTrue(any("90-110" in f for f in flags) and any("Fewer than 5" in f for f in flags))
        with self.assertRaises(ValueError):  # slope must be negative
            b.standard_curve([{"quantity": 10, "ct": 20}, {"quantity": 100, "ct": 22}, {"quantity": 1000, "ct": 25}])
        with self.assertRaises(ValueError):  # fewer than 3 distinct quantities
            b.standard_curve([{"quantity": 10, "ct": 20}, {"quantity": 10, "ct": 21}, {"quantity": 100, "ct": 17}])

    def test_genorm_flags_the_unstable_gene(self):
        base = [20, 21, 19, 22, 20.5, 21.5]
        genes = {"A": base, "B": [x + 1 for x in base], "C": [x + 0.5 for x in base], "D": [20, 24, 18, 25, 19, 23]}
        r = b.genorm(genes)
        self.assertEqual(r["ranking_most_to_least_stable"][-1]["gene"], "D")
        self.assertEqual(r["elimination_steps"][0]["removed"], "D")
        self.assertTrue(all(v < 1e-9 for v in r["m_final_pair"].values()))
        pv = {p["comparison"]: p for p in r["pairwise_variation"]}
        self.assertTrue(pv["V2/3"]["below_0_15"])
        self.assertAlmostEqual(pv["V3/4"]["value"], 0.4488, places=4)
        with self.assertRaises(ValueError):
            b.genorm({"A": base, "B": base})


class PlatePlanner(unittest.TestCase):
    SAMPLES = [f"S{i}" for i in range(1, 13)]

    def test_genes_never_split_and_rows_respected(self):
        r = b.plate_layout(self.SAMPLES, ["G1", "G2", "G3"], 3, 96, True)
        self.assertEqual([(p["genes"], p["wells_used"]) for p in r["plates"]], [(["G1", "G2"], 78), (["G3"], 39)])
        for p in r["plates"]:
            wells = [w["well"] for w in p["wells"]]
            self.assertEqual(len(wells), len(set(wells)))
            rows = {}
            for w in p["wells"]:
                rows.setdefault((w["gene"], w["sample"]), set()).add(w["row"])
            self.assertTrue(all(len(v) == 1 for v in rows.values()))

    def test_384_standards_and_column_fill(self):
        r = b.plate_layout(self.SAMPLES, ["G1", "G2", "G3"], 3, 384, True, 5, "column")
        self.assertEqual((r["n_plates"], r["plates"][0]["wells_used"]), (1, 3 * (12 + 5 + 1) * 3))
        cols = {}
        for w in r["plates"][0]["wells"]:
            cols.setdefault((w["gene"], w["sample"]), set()).add(w["col"])
        self.assertTrue(all(len(v) == 1 for v in cols.values()))

    def test_csv_and_limits(self):
        r = b.plate_layout(self.SAMPLES, ["G1", "G2", "G3"], 3, 96, True)
        self.assertEqual(len(r["csv"].splitlines()), 1 + 3 * 39)
        with self.assertRaises(ValueError):
            b.plate_layout([f"s{i}" for i in range(40)], ["g"], 3, 96)  # one gene needs 123 wells
        with self.assertRaises(ValueError):
            b.plate_layout(self.SAMPLES, ["G1"], 3, 48)


class GenBankIO(unittest.TestCase):
    def setUp(self):
        orf = "ATG" + "GCTAAA" * 30 + "TAA"
        self.seq = "TTTT" + orf + "GAATTC" + revcomp("ATG" + "GCTCGT" * 25 + "TGA") + "TTTT"
        self.out = b.export_genbank("my construct/1", self.seq, [{"type": "primer_bind", "start": 1, "end": 4, "strand": 1, "qualifiers": {
            "label": 'F "1"', "note": "forward primer with a long note that must wrap across more than one line of the GenBank file for sure"}}],
            "Test export", "linear", auto=True, min_orf_aa=20)

    def test_format(self):
        lines = self.out["text"].splitlines()
        self.assertTrue(lines[0].startswith("LOCUS       my_construct_1 "))
        self.assertEqual(lines[0].split()[2:4], [str(len(self.seq)), "bp"])
        self.assertTrue(all(len(line) <= 80 for line in lines))
        self.assertEqual((lines[-1], self.out["text"].count("FEATURES")), ("//", 1))
        origin = lines[lines.index("ORIGIN") + 1:-1]
        self.assertTrue(origin[0].startswith("        1 "))
        self.assertEqual("".join(c for line in origin for c in line if c.isalpha()).upper(), self.seq)
        self.assertIn("complement(", self.out["text"])
        self.assertIn("F '1'", self.out["text"])  # quotes inside values are neutralised

    def test_round_trip(self):
        rec = b.parse_sequence_file(self.out["text"])["records"][0]
        self.assertEqual((rec["sequence"], rec["name"]), (self.seq, "my_construct_1"))
        cds = [f for f in rec["features"] if f["type"] == "CDS"]
        self.assertEqual({f["strand"] for f in cds}, {1, -1})
        plus = next(f for f in cds if f["strand"] == 1)
        self.assertEqual((plus["start"], plus["end"]), (5, 190))
        self.assertEqual(plus["qualifiers"]["translation"], "M" + "AK" * 30)
        minus = next(f for f in cds if f["strand"] == -1)
        self.assertEqual((minus["start"], minus["end"]), (197, 352))
        eco = next(f for f in rec["features"] if f["qualifiers"].get("label") == "EcoRI")
        self.assertEqual(self.seq[eco["start"] - 1:eco["end"]], "GAATTC")
        note = next(f for f in rec["features"] if f["type"] == "primer_bind")["qualifiers"]["note"]
        self.assertIn("wrap across more than one line", note)
        self.assertNotIn("  ", note)

    def test_fasta_and_rejections(self):
        f = b.parse_sequence_file(">a desc\nACGTNNACGT\n>b\nacgtacgt")
        self.assertEqual((f["format"], len(f["records"]), f["records"][1]["sequence"]), ("FASTA", 2, "ACGTACGT"))
        self.assertTrue(f["records"][0]["warnings"])
        for bad in ("", "LOCUS       x 5 bp\nORIGIN\n//", ">x\nACGT!!", "not a sequence file at all 123"):
            with self.assertRaises(ValueError):
                b.parse_sequence_file(bad)
        for feats, topo in (([{"type": "evil", "start": 1, "end": 5}], "linear"), ([{"type": "CDS", "start": 5, "end": 99999}], "linear"), ([], "ring")):
            with self.assertRaises(ValueError):
                b.export_genbank("x", "ACGT" * 10, feats, "", topo)

    def test_joined_feature_is_flagged(self):
        gb = ("LOCUS       j   40 bp    DNA     linear   SYN 01-JAN-2026\nFEATURES             Location/Qualifiers\n     CDS             join(1..10,21..30)\n"
              "                     /label=\"x\"\nORIGIN\n        1 acgtacgtac gtacgtacgt acgtacgtac gtacgtacgt\n//\n")
        rec = b.parse_sequence_file(gb)["records"][0]
        self.assertEqual((rec["features"][0]["start"], rec["features"][0]["end"]), (1, 30))
        self.assertTrue(rec["warnings"])


class ExternalServiceParsing(unittest.TestCase):
    """The services themselves are mocked: these tests check OUR parsing and validation only."""

    def test_gprofiler(self):
        class R:
            status_code = 200
            def json(self): return {"result": [{"source": "GO:BP", "native": "GO:1", "name": "x", "p_value": 1e-5, "term_size": 10, "query_size": 3, "intersection_size": 2},
                                              {"source": "KEGG", "native": "K:1", "name": "y", "p_value": 1e-8, "term_size": 10, "query_size": 3, "intersection_size": 3},
                                              {"source": "REAC", "native": "R:1", "name": "bad", "p_value": None}]}
        with mock.patch.object(b.requests, "post", return_value=R()):
            r = b.gprofiler_enrich(["TP53", "MDM2", "CDKN1A"])
        self.assertEqual([t["term_id"] for t in r["terms"]], ["K:1", "GO:1"])
        for args in ((["TP53"],), (["TP53", "MDM2"], "alien"), (["TP53", "MD M2"],), (["TP53", "MDM2"], "hsapiens", ["BAD"])):
            with self.assertRaises(ValueError):
                b.gprofiler_enrich(*args)

    def test_string_geo_vep_and_primer_snp(self):
        seen = {}

        def fake_get(url, params=None, **kw):
            seen[url] = params
            if "string-db" in url:
                return [{"preferredName_A": "TP53", "preferredName_B": "MDM2", "score": 0.999}, {"preferredName_A": "TP53", "preferredName_B": "CDKN1A", "score": 0.99}]
            if "esearch" in url:
                return {"esearchresult": {"count": "2", "idlist": ["1", "2"]}}
            if "esummary" in url:
                return {"result": {"uids": ["1", "2"], "1": {"accession": "GSE1", "title": "T", "summary": "S" * 600, "taxon": "Homo sapiens", "gdstype": "x", "n_samples": 3, "pdat": "2023"}, "2": {"title": "no accession"}}}
            if "vep" in url:
                return [{"input": "9:g.1G>C", "most_severe_consequence": "intron_variant", "transcript_consequences": [
                    {"transcript_id": "ENST2", "gene_symbol": "B", "consequence_terms": ["intron_variant"]}, {"transcript_id": "ENST1", "gene_symbol": "A", "canonical": 1, "consequence_terms": ["missense_variant"]}],
                    "colocated_variants": [{"id": "rs1", "clin_sig": ["risk_factor"]}]}]
            if "overlap" in url:
                return [{"id": "rs1", "start": 118, "end": 118}, {"id": "rs2", "start": 105, "end": 105}, {"id": "rs3", "start": 102, "end": 102}]
            raise AssertionError(url)

        with mock.patch.object(b, "_get", side_effect=fake_get):
            s = b.string_network(["TP53", "MDM2", "CDKN1A", "LONELY1"])
            self.assertEqual((s["n_edges"], s["n_nodes"], s["isolated_queries"]), (2, 3, ["LONELY1"]))
            self.assertEqual(seen["https://string-db.org/api/json/network"]["species"], 9606)
            g = b.geo_search("breast cancer RNA-seq")
            self.assertEqual((g["total"], len(g["items"]), len(g["items"][0]["summary"])), (2, 1, 400))
            self.assertIn("gse[ETYP]", seen["https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"]["term"])
            v = b.vep_annotate("9:g.22125504G>C")
            self.assertTrue(v["transcripts"][0]["canonical"])
            self.assertIn("not a clinical", v["limits"].lower())
            for bad in ("rs123", "9:g.1G>C; DROP", "../../etc:c.1A>G"):
                with self.assertRaises(ValueError):
                    b.vep_annotate(bad)
            plus = b.primer_snp_check([{"name": "F", "chrom": "chr17", "start": 100, "end": 119, "strand": "+"}])["primers"][0]
            self.assertEqual([(h["id"], h["distance_from_3prime_end"]) for h in plus["variants"]], [("rs1", 1), ("rs2", 14), ("rs3", 17)])
            self.assertTrue(plus["variants"][0]["risk"].startswith("3' critical"))
            minus = b.primer_snp_check([{"name": "R", "chrom": "17", "start": 100, "end": 119, "strand": "-"}])["primers"][0]
            self.assertEqual([(h["id"], h["distance_from_3prime_end"]) for h in minus["variants"]], [("rs3", 2), ("rs2", 5), ("rs1", 18)])
            for bad in ({"chrom": "99", "start": 1, "end": 30, "strand": "+"}, {"chrom": "1", "start": 1, "end": 500, "strand": "+"}, {"chrom": "1", "start": 1, "end": 30, "strand": "?"}):
                with self.assertRaises(ValueError):
                    b.primer_snp_check([bad])

    def test_network_failure_is_typed(self):
        with mock.patch.object(b.requests, "get", side_effect=b.requests.ConnectionError("x")):
            with self.assertRaises(RuntimeError):
                b._get("https://example.invalid/")


if __name__ == "__main__":
    unittest.main()
