"""Bounded, opt-in AutoDock Vina execution for prepared PDBQT inputs.

This is a limited research prototype, not an isolated multi-tenant job service.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import subprocess
import sys
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

MAX_RECEPTOR_BYTES = 2_000_000
MAX_LIGAND_BYTES = 300_000
MAX_RESULT_BYTES = 4_000_000
TIMEOUT_SECONDS = 90
_SLOT = threading.BoundedSemaphore(1)


class DockingDisabled(Exception):
    pass


class DockingUnavailable(Exception):
    pass


class DockingBusy(Exception):
    pass


class DockingTimedOut(Exception):
    pass


class DockingFailed(Exception):
    pass


def docking_status() -> dict:
    enabled = os.getenv("PHARMA_DOCKING_ENABLED", "").lower() in {"1", "true", "yes"}
    available = importlib.util.find_spec("vina") is not None
    worker_available = Path(__file__).with_name("pharma_docking_worker.py").is_file()
    return {"enabled": enabled, "engine_available": available, "worker_available": worker_available,
            "ready": enabled and available and worker_available, "timeout_seconds": TIMEOUT_SECONDS}


def _validate_pdbqt(text: str, ligand: bool) -> bytes:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Both prepared PDBQT files are required")
    try:
        content = text.encode("ascii")
    except UnicodeEncodeError as exc:
        raise ValueError("PDBQT files must contain ASCII text") from exc
    if len(content) > (MAX_LIGAND_BYTES if ligand else MAX_RECEPTOR_BYTES):
        raise ValueError("PDBQT file exceeds the size limit")
    lines = text.splitlines()
    if any(len(line) > 1000 for line in lines):
        raise ValueError("Invalid PDBQT line length")
    atoms = [line for line in lines if line[:6].strip() in {"ATOM", "HETATM"}]
    if not atoms or len(atoms) > (250 if ligand else 15000):
        raise ValueError("PDBQT atom count is outside the allowed range")
    if ligand:
        tags = [line.strip().split(maxsplit=1)[0] for line in lines if line.strip()]
        if tags.count("ROOT") != 1 or tags.count("ENDROOT") != 1 or tags.count("TORSDOF") != 1:
            raise ValueError("A single prepared ligand PDBQT with ROOT, ENDROOT and TORSDOF is required")
        if "MODEL" in tags or "ENDMDL" in tags:
            raise ValueError("Ligand input must contain one prepared molecule, not multiple models")
    return content


def validate_inputs(payload: dict) -> tuple[bytes, bytes]:
    receptor = _validate_pdbqt(payload.get("receptor_pdbqt"), ligand=False)
    ligand = _validate_pdbqt(payload.get("ligand_pdbqt"), ligand=True)
    for name, low, high in (("center", -10000, 10000), ("size", 4, 28)):
        values = payload.get(name)
        if not isinstance(values, list) or len(values) != 3:
            raise ValueError(f"{name} must contain three coordinates")
        for number in values:
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not low <= number <= high:
                raise ValueError(f"Invalid {name} coordinate")
    for name, low, high in (("seed", 1, 2147483647), ("exhaustiveness", 1, 8), ("num_poses", 1, 5)):
        value = payload.get(name)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f"Invalid {name}")
    return receptor, ligand


def run_docking(payload: dict) -> dict:
    """Run one short local subprocess; raw inputs are removed with temp files."""
    status = docking_status()
    if not status["enabled"]:
        raise DockingDisabled()
    if not status["engine_available"] or not status["worker_available"]:
        raise DockingUnavailable()
    receptor, ligand = validate_inputs(payload)
    if not _SLOT.acquire(blocking=False):
        raise DockingBusy()
    try:
        worker = Path(__file__).with_name("pharma_docking_worker.py").resolve()
        if not worker.is_file():
            raise DockingUnavailable()
        with tempfile.TemporaryDirectory(prefix="primer_dock_") as folder:
            os.chmod(folder, 0o700)
            input_path = Path(folder) / "input.json"
            output_path = Path(folder) / "output.json"
            input_path.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
            os.chmod(input_path, 0o600)
            # Do not pass app credentials or connection strings to the child.
            env = {"PATH": os.defpath, "HOME": folder, "LANG": "C.UTF-8",
                   "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
            try:
                process = subprocess.run(
                    [sys.executable, "-I", str(worker), str(input_path), str(output_path)],
                    cwd=folder, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, timeout=TIMEOUT_SECONDS, check=False,
                )
            except subprocess.TimeoutExpired as exc:
                raise DockingTimedOut() from exc
            except OSError as exc:
                raise DockingUnavailable() from exc
            if process.returncode != 0 or not output_path.is_file() or output_path.stat().st_size > MAX_RESULT_BYTES:
                raise DockingFailed()
            try:
                result = json.loads(output_path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as exc:
                raise DockingFailed() from exc
            if not isinstance(result, dict) or not isinstance(result.get("scores"), list) or not isinstance(result.get("poses_pdbqt"), str):
                raise DockingFailed()
            result.update({
                "receptor_sha256": hashlib.sha256(receptor).hexdigest(),
                "ligand_sha256": hashlib.sha256(ligand).hexdigest(),
                "center": payload["center"], "size": payload["size"],
                "seed": payload["seed"], "exhaustiveness": payload["exhaustiveness"],
                "requested_poses": payload["num_poses"], "cpu": 1, "scoring": "vina",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            return result
    finally:
        _SLOT.release()
