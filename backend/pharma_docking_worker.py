"""Isolated process entry point for the opt-in research docking prototype."""
from __future__ import annotations

import json
import math
import sys
from importlib.metadata import version
from pathlib import Path


def main(input_path: str, output_path: str) -> None:
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (75, 80))
        resource.setrlimit(resource.RLIMIT_FSIZE, (8_000_000, 8_000_000))
    except (ImportError, OSError, ValueError):
        pass
    from vina import Vina

    payload = json.loads(Path(input_path).read_text(encoding="utf-8"))
    receptor = Path(input_path).parent / "receptor.pdbqt"
    receptor.write_text(payload["receptor_pdbqt"], encoding="ascii")
    engine = Vina(sf_name="vina", cpu=1, seed=payload["seed"], verbosity=0)
    engine.set_receptor(str(receptor))
    engine.set_ligand_from_string(payload["ligand_pdbqt"])
    engine.compute_vina_maps(center=payload["center"], box_size=payload["size"])
    engine.dock(exhaustiveness=payload["exhaustiveness"], n_poses=payload["num_poses"])
    raw = engine.energies(n_poses=payload["num_poses"], energy_range=3.0)
    poses = engine.poses(n_poses=payload["num_poses"], energy_range=3.0)
    scores = []
    for row in raw:
        score = float(row[0])
        if not math.isfinite(score):
            raise ValueError("Non-finite docking score")
        scores.append(score)
    if not scores or not isinstance(poses, str) or not poses.strip():
        raise ValueError("The engine returned no poses")
    out = {"engine": "AutoDock Vina", "engine_version": version("vina"),
           "energy_units": "kcal/mol", "scores": scores, "poses_pdbqt": poses,
           "energy_range_kcal_mol": 3.0}
    Path(output_path).write_text(json.dumps(out, ensure_ascii=True, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
