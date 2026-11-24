"""Organization workspace: versioned dossiers, review/approval, audit trail, challenges and trial landscape.

All routes are attached to the access-gated Pharma router and are organization-scoped:
  * reading needs membership; writing needs owner/admin/researcher (WRITERS); managing challenges needs owner/admin (MANAGERS);
  * dossier versions are append-only and carry a SHA-256 of their canonical content, so a review is bound to exact content;
  * every dossier action is written to an audit table.
Research and teaching use only. This is a documentation workflow, not a regulatory system.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from pharma_helpers import _iso, _row, _uid
from workspace_tools import (canonical_json, clean_sections, content_hash, generate_methods, leaderboard, miqe_checklist, rubric, score_submission,
                             trial_landscape, validate_challenge_config)

log = logging.getLogger("primerai.workspace")


def register_workspace_routes(router, *, database, metadata, engine, get_current_user, require, WRITERS, MANAGERS, egress):
    S = sqlalchemy
    now_col = S.func.now()

    def table(name, *cols):
        return S.Table(name, metadata, *cols, extend_existing=True)

    ts = lambda: S.Column("created_at", S.DateTime(timezone=True), server_default=now_col)  # noqa: E731
    dossiers = table("ws_dossiers", S.Column("id", S.String(36), primary_key=True), S.Column("organization_id", S.String(36), nullable=False, index=True),
                     S.Column("project_id", S.String(36)), S.Column("title", S.String(200), nullable=False), S.Column("created_by", S.Integer, nullable=False), ts(),
                     S.Column("updated_at", S.DateTime(timezone=True), server_default=now_col))
    versions = table("ws_dossier_versions", S.Column("id", S.String(36), primary_key=True), S.Column("dossier_id", S.String(36), nullable=False, index=True),
                     S.Column("version", S.Integer, nullable=False), S.Column("content", S.Text, nullable=False), S.Column("sha256", S.String(64), nullable=False),
                     S.Column("note", S.String(300)), S.Column("created_by", S.Integer, nullable=False), ts())
    reviews = table("ws_reviews", S.Column("id", S.String(36), primary_key=True), S.Column("dossier_id", S.String(36), nullable=False, index=True),
                    S.Column("organization_id", S.String(36), nullable=False, index=True), S.Column("version", S.Integer, nullable=False),
                    S.Column("sha256", S.String(64), nullable=False), S.Column("requested_by", S.Integer, nullable=False), S.Column("reviewer_id", S.Integer, nullable=False, index=True),
                    S.Column("status", S.String(20), nullable=False), S.Column("comment", S.Text), ts(), S.Column("decided_at", S.DateTime(timezone=True)))
    audit_t = table("ws_audit", S.Column("id", S.Integer, primary_key=True, autoincrement=True), S.Column("organization_id", S.String(36), nullable=False, index=True),
                    S.Column("dossier_id", S.String(36)), S.Column("actor_id", S.Integer, nullable=False), S.Column("action", S.String(40), nullable=False),
                    S.Column("detail", S.String(400)), ts())
    challenges = table("ws_challenges", S.Column("id", S.String(36), primary_key=True), S.Column("organization_id", S.String(36), nullable=False, index=True),
                       S.Column("title", S.String(160), nullable=False), S.Column("description", S.Text), S.Column("kind", S.String(20), nullable=False),
                       S.Column("config", S.Text, nullable=False), S.Column("created_by", S.Integer, nullable=False), ts(), S.Column("closes_at", S.DateTime(timezone=True)))
    submissions = table("ws_submissions", S.Column("id", S.String(36), primary_key=True), S.Column("challenge_id", S.String(36), nullable=False, index=True),
                        S.Column("user_id", S.Integer, nullable=False, index=True), S.Column("label", S.String(80), nullable=False), S.Column("score", S.Float, nullable=False),
                        S.Column("valid", S.Boolean, nullable=False), S.Column("details", S.Text), ts())
    metadata.create_all(bind=engine, tables=[dossiers, versions, reviews, audit_t, challenges, submissions])

    # ------------------------------------------------------------- models
    class DossierCreate(BaseModel):
        title: str = Field(min_length=2, max_length=200)
        project_id: Optional[str] = Field(None, max_length=36)
        sections: list[dict]
        note: str = Field("", max_length=300)

    class VersionAdd(BaseModel):
        sections: list[dict]
        note: str = Field("", max_length=300)

    class ReviewRequest(BaseModel):
        version: int = Field(ge=1)
        reviewer_user_id: int

    class ReviewDecision(BaseModel):
        status: str = Field(max_length=20)
        comment: str = Field("", max_length=2000)

    class ChallengeCreate(BaseModel):
        title: str = Field(min_length=2, max_length=160)
        description: str = Field("", max_length=4000)
        kind: str = Field(max_length=20)
        config: dict
        closes_at: Optional[str] = Field(None, max_length=40)

    class Submit(BaseModel):
        label: str = Field(min_length=2, max_length=80)
        payload: dict

    class Landscape(BaseModel):
        condition: str = Field("", max_length=150)
        intervention: str = Field("", max_length=150)
        term: str = Field("", max_length=150)

    # ------------------------------------------------------------ helpers
    def clean422(fn, *args):
        try:
            return fn(*args)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    async def audit(org, dossier_id, actor, action, detail=""):
        await database.execute(audit_t.insert().values(organization_id=org, dossier_id=dossier_id, actor_id=_uid(actor), action=action, detail=str(detail)[:400]))

    async def get_dossier(org, did):
        row = await database.fetch_one(S.select(dossiers).where(dossiers.c.id == did, dossiers.c.organization_id == org))
        if not row:
            raise HTTPException(404, "Dossier not found")
        return _row(row)

    async def get_version(did, n):
        row = await database.fetch_one(S.select(versions).where(versions.c.dossier_id == did, versions.c.version == n))
        if not row:
            raise HTTPException(404, "Version not found")
        r = _row(row)
        content = json.loads(r["content"])
        return {**r, "content": content, "created_at": _iso(r["created_at"]), "integrity_ok": content_hash(content) == r["sha256"]}

    async def latest_number(did):
        row = await database.fetch_one(S.select(S.func.max(versions.c.version).label("n")).where(versions.c.dossier_id == did))
        return (_row(row)["n"] if row else None) or 0

    async def insert_version(did, n, sections, note, user):
        content = {"sections": sections}
        sha = content_hash(content)
        await database.execute(versions.insert().values(id=str(uuid.uuid4()), dossier_id=did, version=n, content=canonical_json(content), sha256=sha, note=note.strip(), created_by=_uid(user)))
        await database.execute(dossiers.update().where(dossiers.c.id == did).values(updated_at=datetime.now(timezone.utc)))
        return sha

    def review_out(r, uid):
        d = _row(r)
        return {"id": d["id"], "dossier_id": d["dossier_id"], "version": d["version"], "sha256": d["sha256"], "requested_by": d["requested_by"], "reviewer_id": d["reviewer_id"],
                "status": d["status"], "comment": d["comment"] or "", "created_at": _iso(d["created_at"]), "decided_at": _iso(d["decided_at"]), "mine": d["reviewer_id"] == uid}

    # ----------------------------------------------------------- dossiers
    @router.get("/organizations/{organization_id}/dossiers")
    async def list_dossiers(organization_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        rows = await database.fetch_all(S.select(dossiers).where(dossiers.c.organization_id == organization_id).order_by(dossiers.c.updated_at.desc()).limit(200))
        ids = [_row(r)["id"] for r in rows]
        nums = {}
        if ids:
            for r in await database.fetch_all(S.select(versions.c.dossier_id, S.func.max(versions.c.version).label("n")).where(versions.c.dossier_id.in_(ids)).group_by(versions.c.dossier_id)):
                nums[_row(r)["dossier_id"]] = _row(r)["n"]
        return {"items": [{"id": d["id"], "title": d["title"], "project_id": d["project_id"], "latest_version": nums.get(d["id"], 0), "updated_at": _iso(d["updated_at"])} for d in map(_row, rows)]}

    @router.post("/organizations/{organization_id}/dossiers", status_code=201)
    async def create_dossier(organization_id: str, req: DossierCreate, user=Depends(get_current_user)):
        await require(organization_id, user, *WRITERS)
        sections = clean422(clean_sections, req.sections)
        did = str(uuid.uuid4())
        async with database.transaction():
            await database.execute(dossiers.insert().values(id=did, organization_id=organization_id, project_id=req.project_id, title=req.title.strip(), created_by=_uid(user)))
            sha = await insert_version(did, 1, sections, req.note, user)
            await audit(organization_id, did, user, "created", f"version 1 {sha[:12]}")
        return {"id": did, "version": 1, "sha256": sha}

    @router.get("/organizations/{organization_id}/dossiers/{dossier_id}")
    async def dossier_detail(organization_id: str, dossier_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        d = await get_dossier(organization_id, dossier_id)
        n = await latest_number(dossier_id)
        vrows = await database.fetch_all(S.select(versions.c.version, versions.c.sha256, versions.c.note, versions.c.created_by, versions.c.created_at)
                                         .where(versions.c.dossier_id == dossier_id).order_by(versions.c.version.desc()))
        rrows = await database.fetch_all(S.select(reviews).where(reviews.c.dossier_id == dossier_id).order_by(reviews.c.created_at.desc()))
        latest = await get_version(dossier_id, n) if n else None
        return {"id": d["id"], "title": d["title"], "project_id": d["project_id"], "latest_version": n,
                "versions": [{**_row(v), "created_at": _iso(_row(v)["created_at"])} for v in vrows],
                "latest": {"version": n, "sha256": latest["sha256"], "integrity_ok": latest["integrity_ok"], "content": latest["content"]} if latest else None,
                "reviews": [review_out(r, _uid(user)) for r in rrows]}

    @router.get("/organizations/{organization_id}/dossiers/{dossier_id}/versions/{version}")
    async def dossier_version(organization_id: str, dossier_id: str, version: int, user=Depends(get_current_user)):
        await require(organization_id, user)
        await get_dossier(organization_id, dossier_id)
        v = await get_version(dossier_id, version)
        return {"version": v["version"], "sha256": v["sha256"], "integrity_ok": v["integrity_ok"], "note": v["note"], "created_at": v["created_at"], "content": v["content"]}

    @router.post("/organizations/{organization_id}/dossiers/{dossier_id}/versions", status_code=201)
    async def add_version(organization_id: str, dossier_id: str, req: VersionAdd, user=Depends(get_current_user)):
        await require(organization_id, user, *WRITERS)
        await get_dossier(organization_id, dossier_id)
        sections = clean422(clean_sections, req.sections)
        async with database.transaction():
            n = await latest_number(dossier_id) + 1
            sha = await insert_version(dossier_id, n, sections, req.note, user)
            await audit(organization_id, dossier_id, user, "version_added", f"version {n} {sha[:12]}")
        return {"version": n, "sha256": sha}

    @router.get("/organizations/{organization_id}/dossiers/{dossier_id}/methods")
    async def dossier_methods(organization_id: str, dossier_id: str, version: int = 0, user=Depends(get_current_user)):
        await require(organization_id, user)
        await get_dossier(organization_id, dossier_id)
        n = version or await latest_number(dossier_id)
        v = await get_version(dossier_id, n)
        secs = v["content"].get("sections") or []
        return {"version": n, "sha256": v["sha256"], "methods": generate_methods(secs), "checklist": miqe_checklist(secs)}

    @router.get("/organizations/{organization_id}/dossiers/{dossier_id}/audit")
    async def dossier_audit(organization_id: str, dossier_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        await get_dossier(organization_id, dossier_id)
        rows = await database.fetch_all(S.select(audit_t).where(audit_t.c.organization_id == organization_id, audit_t.c.dossier_id == dossier_id).order_by(audit_t.c.id.desc()).limit(200))
        return {"items": [{"actor_id": _row(r)["actor_id"], "action": _row(r)["action"], "detail": _row(r)["detail"], "at": _iso(_row(r)["created_at"])} for r in rows]}

    # ------------------------------------------------------------ reviews
    @router.post("/organizations/{organization_id}/dossiers/{dossier_id}/reviews", status_code=201)
    async def request_review(organization_id: str, dossier_id: str, req: ReviewRequest, user=Depends(get_current_user)):
        await require(organization_id, user, *WRITERS)
        await get_dossier(organization_id, dossier_id)
        v = await get_version(dossier_id, req.version)
        if req.reviewer_user_id == _uid(user):
            raise HTTPException(422, "You cannot review your own request")
        await require(organization_id, {"id": req.reviewer_user_id}, *WRITERS)  # reviewer must be a member who can write
        rid = str(uuid.uuid4())
        async with database.transaction():
            await database.execute(reviews.insert().values(id=rid, dossier_id=dossier_id, organization_id=organization_id, version=req.version, sha256=v["sha256"],
                                                           requested_by=_uid(user), reviewer_id=req.reviewer_user_id, status="requested"))
            await audit(organization_id, dossier_id, user, "review_requested", f"version {req.version} -> user {req.reviewer_user_id}")
        return {"id": rid, "status": "requested", "sha256": v["sha256"]}

    @router.get("/organizations/{organization_id}/reviews/pending")
    async def pending_reviews(organization_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        rows = await database.fetch_all(S.select(reviews).where(reviews.c.organization_id == organization_id, reviews.c.reviewer_id == _uid(user), reviews.c.status == "requested"))
        return {"items": [review_out(r, _uid(user)) for r in rows]}

    @router.post("/organizations/{organization_id}/reviews/{review_id}/decision")
    async def decide_review(organization_id: str, review_id: str, req: ReviewDecision, user=Depends(get_current_user)):
        await require(organization_id, user, *WRITERS)
        if req.status not in ("approved", "changes_requested"):
            raise HTTPException(422, "Decision must be approved or changes_requested")
        row = await database.fetch_one(S.select(reviews).where(reviews.c.id == review_id, reviews.c.organization_id == organization_id))
        if not row:
            raise HTTPException(404, "Review not found")
        r = _row(row)
        if r["reviewer_id"] != _uid(user):
            raise HTTPException(403, "Only the assigned reviewer can decide")
        if r["status"] != "requested":
            raise HTTPException(409, "This review has already been decided")
        v = await get_version(r["dossier_id"], r["version"])
        if v["sha256"] != r["sha256"] or not v["integrity_ok"]:
            raise HTTPException(409, "The reviewed version no longer matches its recorded hash")
        async with database.transaction():
            await database.execute(reviews.update().where(reviews.c.id == review_id).values(status=req.status, comment=req.comment.strip(), decided_at=datetime.now(timezone.utc)))
            await audit(organization_id, r["dossier_id"], user, "review_" + req.status, f"version {r['version']}")
        return {"status": req.status, "version": r["version"], "sha256": r["sha256"]}

    # --------------------------------------------------------- challenges
    def parse_close(text):
        if not text:
            return None
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(422, "closes_at must be an ISO date-time") from exc
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    def challenge_out(c, with_config=False):
        d = _row(c)
        cfg = json.loads(d["config"])
        out = {"id": d["id"], "title": d["title"], "description": d["description"] or "", "kind": d["kind"], "rubric": rubric(d["kind"]), "created_at": _iso(d["created_at"]),
               "closes_at": _iso(d["closes_at"]), "open": d["closes_at"] is None or d["closes_at"] > datetime.now(timezone.utc)}
        out["task"] = {"protein": cfg.get("protein"), "forbidden_sites": cfg.get("forbidden_sites"), "gc_min": cfg.get("gc_min"), "gc_max": cfg.get("gc_max")} if d["kind"] == "codon" else \
                      {"n_references": len(cfg.get("references", [])), "min_epitopes": cfg.get("min_epitopes"), "max_epitopes": cfg.get("max_epitopes"), "length_max": cfg.get("length_max"),
                       "references": cfg.get("references")}
        return out

    @router.get("/organizations/{organization_id}/challenges")
    async def list_challenges(organization_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        rows = await database.fetch_all(S.select(challenges).where(challenges.c.organization_id == organization_id).order_by(challenges.c.created_at.desc()).limit(100))
        return {"items": [challenge_out(r) for r in rows]}

    @router.post("/organizations/{organization_id}/challenges", status_code=201)
    async def create_challenge(organization_id: str, req: ChallengeCreate, user=Depends(get_current_user)):
        await require(organization_id, user, *MANAGERS)
        cfg = clean422(validate_challenge_config, req.kind, req.config)
        cid = str(uuid.uuid4())
        await database.execute(challenges.insert().values(id=cid, organization_id=organization_id, title=req.title.strip(), description=req.description.strip(), kind=req.kind,
                                                          config=json.dumps(cfg), created_by=_uid(user), closes_at=parse_close(req.closes_at)))
        return {"id": cid}

    async def get_challenge(org, cid):
        row = await database.fetch_one(S.select(challenges).where(challenges.c.id == cid, challenges.c.organization_id == org))
        if not row:
            raise HTTPException(404, "Challenge not found")
        return row

    @router.post("/organizations/{organization_id}/challenges/{challenge_id}/submit", status_code=201)
    async def submit_challenge(organization_id: str, challenge_id: str, req: Submit, user=Depends(get_current_user)):
        await require(organization_id, user, *WRITERS)
        row = await get_challenge(organization_id, challenge_id)
        c = _row(row)
        if c["closes_at"] is not None and c["closes_at"] <= datetime.now(timezone.utc):
            raise HTTPException(409, "This challenge is closed")
        mine = await database.fetch_one(S.select(S.func.count().label("n")).where(submissions.c.challenge_id == challenge_id, submissions.c.user_id == _uid(user)))
        if mine and (_row(mine)["n"] or 0) >= 30:
            raise HTTPException(429, "Submission limit reached for this challenge")
        result = await run_in_threadpool(clean422, score_submission, c["kind"], json.loads(c["config"]), req.payload)
        await database.execute(submissions.insert().values(id=str(uuid.uuid4()), challenge_id=challenge_id, user_id=_uid(user), label=req.label.strip(), score=float(result["score"]),
                                                           valid=bool(result["valid"]), details=json.dumps(result)))
        return result

    @router.get("/organizations/{organization_id}/challenges/{challenge_id}/leaderboard")
    async def challenge_leaderboard(organization_id: str, challenge_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        await get_challenge(organization_id, challenge_id)
        rows = await database.fetch_all(S.select(submissions).where(submissions.c.challenge_id == challenge_id, submissions.c.valid == True).limit(3000))  # noqa: E712
        data = [{"user_id": _row(r)["user_id"], "label": _row(r)["label"], "score": _row(r)["score"], "ts": _row(r)["created_at"].timestamp()} for r in rows]
        board = leaderboard(data)
        me = _uid(user)
        return {"items": [{"rank": b["rank"], "label": b["label"], "score": b["score"], "mine": b["user_id"] == me} for b in board], "n_participants": len({d["user_id"] for d in data})}

    # ------------------------------------------------- trial landscape
    @router.post("/workspace/landscape")
    async def landscape(req: Landscape, user=Depends(get_current_user)):
        egress.CURRENT_USER.set(user)
        try:
            return await egress.run_external(trial_landscape, "ClinicalTrials.gov", "landscape", (req.condition, req.intervention, req.term))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(502, str(exc)) from exc
