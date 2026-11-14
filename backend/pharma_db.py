"""SQLAlchemy table definitions for the Pharma research module.

Table names (including _v1 / _v2 suffixes) are stable for existing deployments.
Do not rename without a migration plan.
"""
from __future__ import annotations

import sqlalchemy


def define_pharma_tables(metadata: sqlalchemy.MetaData):
    """Register all Pharma tables on the shared metadata and return them."""
    now = sqlalchemy.func.now()
    organizations = sqlalchemy.Table(
        "pharma_organizations", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("owner_user_id", sqlalchemy.Integer, nullable=False, index=True),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    members = sqlalchemy.Table(
        "pharma_organization_members", metadata,
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("user_id", sqlalchemy.Integer, primary_key=True),
        sqlalchemy.Column("role", sqlalchemy.String(20), nullable=False),
        sqlalchemy.Column("added_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    # New table name (v2) so earlier MVP deployments need no ALTER TABLE.
    projects = sqlalchemy.Table(
        "pharma_projects_v2", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), nullable=False, index=True),
        sqlalchemy.Column("created_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("drug_chembl_id", sqlalchemy.String(20), nullable=False, index=True),
        sqlalchemy.Column("drug_name", sqlalchemy.String(200), nullable=False),
        sqlalchemy.Column("organism", sqlalchemy.String(100), nullable=False),
        sqlalchemy.Column("model_system", sqlalchemy.String(200), nullable=False, default=""),
        sqlalchemy.Column("dose_text", sqlalchemy.String(120), nullable=False, default=""),
        sqlalchemy.Column("duration_text", sqlalchemy.String(120), nullable=False, default=""),
        sqlalchemy.Column("hypothesis", sqlalchemy.Text, nullable=False, default=""),
        sqlalchemy.Column("genes", sqlalchemy.Text, nullable=False),
        sqlalchemy.Column("pathways", sqlalchemy.Text, nullable=False, default="[]"),
        sqlalchemy.Column("evidence", sqlalchemy.Text, nullable=False),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    library = sqlalchemy.Table(
        "pharma_library_items_v1", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), nullable=False, index=True),
        sqlalchemy.Column("created_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("kind", sqlalchemy.String(24), nullable=False),
        sqlalchemy.Column("source_id", sqlalchemy.String(200), nullable=False),
        sqlalchemy.Column("title", sqlalchemy.String(500), nullable=False),
        sqlalchemy.Column("summary", sqlalchemy.Text, nullable=False, default=""),
        sqlalchemy.Column("url", sqlalchemy.String(1000), nullable=False),
        sqlalchemy.Column("provider", sqlalchemy.String(100), nullable=False),
        sqlalchemy.Column("license", sqlalchemy.String(300), nullable=False, default=""),
        sqlalchemy.Column("retrieved_at", sqlalchemy.String(60), nullable=False, default=""),
        sqlalchemy.Column("details", sqlalchemy.Text, nullable=False, default="{}"),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        sqlalchemy.UniqueConstraint("organization_id", "kind", "source_id", name="uq_pharma_library_source"),
        extend_existing=True,
    )
    cache = sqlalchemy.Table(
        "pharma_source_cache", metadata,
        sqlalchemy.Column("key", sqlalchemy.String(120), primary_key=True),
        sqlalchemy.Column("payload", sqlalchemy.Text, nullable=False),
        sqlalchemy.Column("fetched_at", sqlalchemy.DateTime(timezone=True), nullable=False),
        extend_existing=True,
    )
    access = sqlalchemy.Table(
        "pharma_access_requests_v1", metadata,
        sqlalchemy.Column("user_id", sqlalchemy.Integer, primary_key=True),
        sqlalchemy.Column("organization_name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("purpose", sqlalchemy.String(1000), nullable=False),
        sqlalchemy.Column("status", sqlalchemy.String(16), nullable=False, index=True),
        sqlalchemy.Column("reviewed_by", sqlalchemy.Integer, nullable=True),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        sqlalchemy.Column("updated_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    return {
        "organizations": organizations,
        "members": members,
        "projects": projects,
        "library": library,
        "cache": cache,
        "access": access,
    }
