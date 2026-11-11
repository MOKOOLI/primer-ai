"""Regression tests for Primer AI's scientific math, auth, classroom and qPCR flows.

Run from the backend project root with: pytest -q tests/test_science_and_features.py
The environment variables are set before importing the app so tests use an isolated SQLite DB.
"""
import os
import tempfile
import uuid
from pathlib import Path

_db = Path(tempfile.gettempdir()) / f"primer_ai_test_{uuid.uuid4().hex}.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ["SECRET_KEY"] = "test-only-secret-key"
os.environ["ENV"] = "test"

import pytest
from fastapi.testclient import TestClient
import main


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


def _auth_user(email: str) -> tuple[int, str]:
    with main.engine.begin() as conn:
        result = conn.execute(main.users_table.insert().values(
            email=email, hashed_password=main.get_password_hash("test-password-123"),
            plan="free", email_verified=True))
        uid = result.inserted_primary_key[0]
    return uid, main.create_access_token({"sub": email})


def _qpcr_wells():
    wells = []
    # Each assay has a high-quality 10-fold standard curve (about 100% efficiency).
    for target, base in [("ACTB", 40.0), ("GENE_X", 40.0)]:
        for i, (qty, ct) in enumerate([(1, base), (10, base - 3.32), (100, base - 6.64)], 1):
            wells.append({"sample": f"std_{target}_{i}", "target": target, "ct": ct,
                          "well_type": "standard", "quantity": qty, "group": "standard"})
    for sample, group, ref_ct, target_ct in [
        ("C1", "control", 20.0, 25.0), ("C2", "control", 20.2, 25.2),
        ("T1", "treated", 20.1, 22.0), ("T2", "treated", 20.3, 22.2),
    ]:
        wells.extend([
            {"sample": sample, "target": "ACTB", "ct": ref_ct, "group": group},
            {"sample": sample, "target": "GENE_X", "ct": target_ct, "group": group},
        ])
    return wells


def test_sequence_validation_and_tm_are_stable():
    assert main.clean_dna("acgtacgt", "sequence", 100) == "ACGTACGT"
    assert main.revcomp("AAGC") == "GCTT"
    assert 0 < main.calc_tm("ACGTACGTACGTACGTACGT") < 100
    with pytest.raises(Exception):
        main.clean_dna("ACGTZ", "sequence", 100)


def test_pfaffl_formula_accounts_for_reference_assay_efficiency():
    # A 3-cycle target shift and 1-cycle reference shift with E=2 gives log2(8/2)=2.
    value = main._pfaffl_log2_fold(25, 22, 20, 19, 2.0, 2.0)
    assert value == pytest.approx(2.0)


def test_welch_test_uses_biological_replicates_and_reports_interval():
    result = main._welch_test([10.0, 11.0, 9.0, 10.5], [7.0, 8.0, 6.5, 7.5])
    assert result["status"] == "calculated"
    assert result["n_control"] == result["n_treatment"] == 4
    assert result["ci95_high"] < 0
    assert result["p_value"] < 0.01
    assert main._welch_test([1.0], [2.0])["status"] == "insufficient_replicates"


def test_qpcr_ddct_includes_welch_statistics_and_input_hash(client):
    r = client.post("/analyze-qpcr", json={
        "wells": _qpcr_wells(), "reference_target": "ACTB", "control_group": "control", "analysis_method": "ddct"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["analysis_method"] == "ddct"
    assert len(data["statistics"]) == 1
    assert data["statistics"][0]["status"] == "calculated"
    assert data["statistics"][0]["n_control"] == 2
    assert len(data["input_sha256"]) == 64
    assert "biological-replicate" in data["statistics"][0]["note"]


def test_qpcr_pfaffl_requires_valid_standard_curves_and_corrects_efficiency(client):
    r = client.post("/analyze-qpcr", json={
        "wells": _qpcr_wells(), "reference_target": "ACTB", "control_group": "control", "analysis_method": "pfaffl"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["analysis_method"] == "pfaffl"
    assert "Pfaffl" in data["method"]
    assert 1.8 <= data["efficiencies"]["gene_x"] <= 2.2
    assert data["groups"]
    assert "log2_fold_change" in data["samples"][0]
    assert data["statistics"][0]["tested_value"] == "log2 relative expression"


def test_qpcr_pfaffl_rejects_missing_standard_curve(client):
    wells = [
        {"sample":"C1","target":"ACTB","ct":20,"group":"control"},
        {"sample":"C1","target":"GENE_X","ct":25,"group":"control"},
        {"sample":"T1","target":"ACTB","ct":20,"group":"treated"},
        {"sample":"T1","target":"GENE_X","ct":23,"group":"treated"},
    ]
    r = client.post("/analyze-qpcr", json={"wells":wells,"reference_target":"ACTB","control_group":"control","analysis_method":"pfaffl"})
    assert r.status_code == 400
    assert "standard curve" in r.json()["detail"].lower()


def test_classroom_join_submit_and_teacher_feedback(client):
    teacher_id, teacher_token = _auth_user(f"teacher-{uuid.uuid4().hex[:8]}@example.test")
    student_id, student_token = _auth_user(f"student-{uuid.uuid4().hex[:8]}@example.test")
    teacher = {"Authorization": f"Bearer {teacher_token}"}
    student = {"Authorization": f"Bearer {student_token}"}
    created = client.post("/classrooms", headers=teacher, json={"name":"Molecular Biology 101"})
    assert created.status_code == 200, created.text
    room = created.json()
    assert room["join_code"]
    joined = client.post("/classrooms/join", headers=student, json={"join_code":room["join_code"]})
    assert joined.status_code == 200 and joined.json()["role"] == "student"
    assignment = client.post(f"/classrooms/{room['id']}/assignments", headers=teacher,
        json={"title":"Primer design", "instructions":"Submit your result."})
    assert assignment.status_code == 200, assignment.text
    aid = assignment.json()["id"]
    submission = client.post(f"/classrooms/{room['id']}/submissions", headers=student,
        json={"assignment_id":aid,"payload":{"design":{"pairs":[]}}})
    assert submission.status_code == 200, submission.text
    sid = submission.json()["id"]
    teacher_view = client.get(f"/classrooms/{room['id']}", headers=teacher).json()
    assert teacher_view["assignments"][0]["submissions"][0]["student_email"].startswith("student-")
    review = client.post(f"/classrooms/{room['id']}/submissions/{sid}/feedback", headers=teacher,
        json={"feedback":"Good controls.","grade":"A"})
    assert review.status_code == 200, review.text
    detail = client.get(f"/classrooms/{room['id']}", headers=student).json()
    assert detail["assignments"][0]["submissions"][0]["feedback"] == "Good controls."
    forbidden = client.post(f"/classrooms/{room['id']}/assignments", headers=student,
        json={"title":"Unauthorized"})
    assert forbidden.status_code == 403


def test_external_sequence_route_rejects_missing_consent_before_network(client):
    r = client.post("/predict-structure", json={"sequence":"M"*30})
    assert r.status_code == 400
    assert "consent" in r.json()["detail"].lower()


def test_email_flows_are_explicitly_disabled_without_smtp(client):
    if main.EMAIL_ENABLED:
        pytest.skip("SMTP enabled in test environment; do not send real email from test suite")
    response = client.post("/register", json={"email":f"auth-{uuid.uuid4().hex[:8]}@example.test","password":"test-password-123"})
    assert response.status_code == 200, response.text
    assert response.json()["verification_required"] is False
