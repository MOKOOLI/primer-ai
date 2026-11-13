"""Primer AI Pharma final checks.

Default: offline tests with mocked sources and a mocked docking process.
--live: additionally contact the public ChEMBL, ClinicalTrials.gov and RCSB APIs.
--dock: additionally run the installed AutoDock Vina on user-supplied PDBQT files.
This script prints results and does not modify your database or save the inputs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import pharma_discovery as discovery
import pharma_docking as docking
import pharma_evidence as evidence
import pharma_structures as structures


RECEPTOR = "ATOM      1  C   ALA A   1       0.000   0.000   0.000  1.00  0.00     0.000 C\n"
LIGAND = ("ROOT\nATOM      1  C   LIG A   1       0.000   0.000   0.000"
          "  1.00  0.00     0.000 C\nENDROOT\nTORSDOF 0\n")


class OfflineChecks(unittest.TestCase):
    """Synthetic fixtures verify code contracts, not scientific results."""

    def test_chembl_preserves_value_qualifier_and_species(self):
        row = {
            "activity_id": 1, "molecule_chembl_id": "CHEMBL25", "assay_type": "T",
            "assay_chembl_id": "CHEMBL1", "document_chembl_id": "CHEMBL2",
            "standard_type": "LD50", "standard_relation": ">", "standard_value": "1000.0",
            "standard_units": "mg.kg-1", "target_organism": "Mus musculus",
        }
        with patch.object(evidence, "_fetch_json", return_value={
            "activities": [row], "page_meta": {"total_count": 1, "next": None}
        }):
            result = evidence.load_chembl_activities("CHEMBL25", "T")
        self.assertEqual(result["items"][0]["standard_relation"], ">")
        self.assertEqual(result["items"][0]["standard_value"], "1000.0")
        self.assertEqual(result["items"][0]["target_organism"], "Mus musculus")

    def test_wrong_compound_is_not_accepted(self):
        with patch.object(discovery, "_fetch_json", return_value={"molecule_chembl_id": "CHEMBL1"}):
            with self.assertRaises(RuntimeError):
                discovery.load_compound_profile("CHEMBL25")

    def test_registered_enrollment_type_is_preserved(self):
        trial = {"protocolSection": {
            "identificationModule": {"nctId": "NCT04280705"},
            "designModule": {"enrollmentInfo": {"count": 500, "type": "ESTIMATED"}},
        }}
        with patch.object(evidence, "_fetch_json", return_value=trial):
            result = evidence.load_clinical_study("NCT04280705")
        self.assertEqual(result["enrollment_count"], 500)
        self.assertEqual(result["enrollment_type"], "ESTIMATED")

    def test_ids_are_validated_before_requests(self):
        for func, value in ((structures.load_experimental_structure, "../bad"),
                            (discovery.search_uniprot_structures, "../bad"),
                            (evidence.load_clinical_study, "../bad")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                func(value)

    def test_docking_input_bounds(self):
        payload = {
            "receptor_pdbqt": RECEPTOR, "ligand_pdbqt": LIGAND,
            "center": [1.0, 2.0, 3.0], "size": [20.0, 20.0, 20.0],
            "seed": 42, "exhaustiveness": 4, "num_poses": 3,
        }
        self.assertEqual(docking.validate_inputs(payload), (RECEPTOR.encode(), LIGAND.encode()))
        for change in ({"size": [0, 20, 20]}, {"center": [float("nan"), 2, 3]},
                       {"ligand_pdbqt": "not PDBQT"}, {"seed": 0}, {"exhaustiveness": 9}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                docking.validate_inputs({**payload, **change})

    def test_docking_process_contract_is_mocked(self):
        payload = {
            "receptor_pdbqt": RECEPTOR, "ligand_pdbqt": LIGAND,
            "center": [1.0, 2.0, 3.0], "size": [20.0, 20.0, 20.0],
            "seed": 42, "exhaustiveness": 4, "num_poses": 3,
        }
        ready = {"enabled": True, "engine_available": True, "worker_available": True,
                 "ready": True, "timeout_seconds": 90}

        def fake_run(args, **kwargs):
            self.assertNotIn("SECRET_KEY", kwargs["env"])
            self.assertEqual(kwargs["timeout"], 90)
            Path(args[4]).write_text(json.dumps({
                "engine": "fixture, not a real run", "scores": [-1.0],
                "poses_pdbqt": "MODEL 1\nENDMDL\n",
            }), encoding="utf-8")
            return subprocess.CompletedProcess(args, 0)

        with patch.object(docking, "docking_status", return_value=ready), \
             patch.object(docking.subprocess, "run", side_effect=fake_run):
            result = docking.run_docking(payload)
        self.assertEqual(result["receptor_sha256"], hashlib.sha256(RECEPTOR.encode()).hexdigest())
        self.assertEqual(result["seed"], 42)
        self.assertEqual(result["engine"], "fixture, not a real run")


def run_live_checks() -> bool:
    print("\nLIVE PUBLIC-SOURCE CHECKS (network required)")
    cases = [
        ("ChEMBL compound CHEMBL25", lambda: discovery.load_compound_profile("CHEMBL25"),
         lambda x: x.get("id") == "CHEMBL25" and bool(x.get("source_url"))),
        ("ChEMBL ADME CHEMBL25", lambda: evidence.load_chembl_activities("CHEMBL25", "A"),
         lambda x: x.get("chembl_id") == "CHEMBL25" and bool(x.get("items"))),
        ("ClinicalTrials.gov NCT04280705", lambda: evidence.load_clinical_study("NCT04280705"),
         lambda x: x.get("id") == "NCT04280705" and bool(x.get("source_url"))),
        ("RCSB PDB entry 4HHB", lambda: structures.load_experimental_structure("4HHB"),
         lambda x: x.get("id") == "4HHB" and bool(x.get("cif"))),
        ("RCSB UniProt structure search P15056", lambda: discovery.search_uniprot_structures("P15056"),
         lambda x: x.get("uniprot") == "P15056" and bool(x.get("pdb_ids"))),
    ]
    passed = True
    for name, loader, predicate in cases:
        try:
            data = loader()
            if not predicate(data):
                raise RuntimeError("Response was empty or failed the expected identity check")
            print(f"PASS  {name}")
        except Exception as exc:
            passed = False
            print(f"FAIL  {name}: {type(exc).__name__}: {exc}")
    print("A source failure may be a network, source, or integration issue; it is not evidence about a drug.")
    return passed


def run_real_docking(args: argparse.Namespace) -> bool:
    print("\nREAL DOCKING CHECK (requires installed and explicitly enabled Vina)")
    try:
        receptor_bytes = args.receptor.read_bytes()
        ligand_bytes = args.ligand.read_bytes()
        payload = {
            "receptor_pdbqt": receptor_bytes.decode("ascii"),
            "ligand_pdbqt": ligand_bytes.decode("ascii"),
            "center": args.center, "size": args.size,
            "seed": args.seed, "exhaustiveness": args.exhaustiveness, "num_poses": args.poses,
        }
        result = docking.run_docking(payload)
        if result.get("engine") != "AutoDock Vina":
            raise RuntimeError("Unexpected engine")
        if not result.get("scores") or not all(math.isfinite(float(x)) for x in result["scores"]):
            raise RuntimeError("No finite scores")
        if not result.get("poses_pdbqt", "").strip():
            raise RuntimeError("No pose output")
        if result["receptor_sha256"] != hashlib.sha256(receptor_bytes).hexdigest():
            raise RuntimeError("Receptor checksum mismatch")
        if result["ligand_sha256"] != hashlib.sha256(ligand_bytes).hexdigest():
            raise RuntimeError("Ligand checksum mismatch")
        print(f"PASS  {result['engine']} {result['engine_version']}: {len(result['scores'])} pose(s)")
        print(f"      seed={result['seed']} center={result['center']} size={result['size']}")
        print(f"      receptor SHA-256={result['receptor_sha256']}")
        print(f"      ligand SHA-256={result['ligand_sha256']}")
        print("This checks execution and provenance only. It does not validate binding, safety, or clinical use.")
        return True
    except Exception as exc:
        print(f"FAIL  Docking execution: {type(exc).__name__}: {exc}")
        print("Check the Vina installation, server opt-in, prepared inputs, box, and service limits.")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Call the public source APIs")
    parser.add_argument("--dock", action="store_true", help="Run a real, explicitly enabled Vina test")
    parser.add_argument("--receptor", type=Path, help="Prepared receptor PDBQT path")
    parser.add_argument("--ligand", type=Path, help="Prepared ligand PDBQT path")
    parser.add_argument("--center", nargs=3, type=float, metavar=("X", "Y", "Z"))
    parser.add_argument("--size", nargs=3, type=float, metavar=("X", "Y", "Z"))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--exhaustiveness", type=int, default=4)
    parser.add_argument("--poses", type=int, default=3)
    args = parser.parse_args()
    if args.dock and (not args.receptor or not args.ligand or args.center is None or args.size is None):
        parser.error("--dock requires --receptor, --ligand, --center X Y Z and --size X Y Z")

    print("OFFLINE CONTRACT TESTS (mocked, no real source calls or docking)")
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(OfflineChecks))
    success = result.wasSuccessful()
    if args.live:
        success = run_live_checks() and success
    if args.dock:
        success = run_real_docking(args) and success
    if not args.live and not args.dock:
        print("\nLive integrations and real Vina were NOT tested. Use --live and/or --dock when ready.")
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
