"""Shared constants for the Pharma research module.

SOURCE_INFO and CATALOG_SOURCES are part of the scientific provenance contract.
GraphQL field lists must stay aligned with normalize_* in pharma_normalize.
"""
from __future__ import annotations

import re
from datetime import timedelta

OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql"
OT_DRUG_URL = "https://platform.opentargets.org/drug/{id}"
OT_TARGET_URL = "https://platform.opentargets.org/target/{id}"
CACHE_TTL = timedelta(days=7)
CATALOG_CACHE_TTL = timedelta(hours=12)
MAX_TARGETS_WITH_PATHWAYS = 15
MAX_PATHWAYS_PER_TARGET = 40

SOURCE_INFO = {
    "provider": "Open Targets Platform",
    "url": "https://platform.opentargets.org",
    "license": "Open Targets Platform data: CC0 1.0",
    "upstream": [
        {"name": "ChEMBL (drug mechanisms of action)", "license": "CC BY-SA 3.0", "url": "https://www.ebi.ac.uk/chembl/"},
        {"name": "Reactome (pathways)", "license": "CC BY 4.0", "url": "https://reactome.org"},
    ],
    "citation": "Open Targets Platform, https://platform.opentargets.org (see platform-docs.opentargets.org/citation)",
    "use": "Research use only. Not for diagnosis, treatment or dosing decisions.",
}

CATALOG_SOURCES = {
    "Open Targets Platform": {
        "url": "https://platform.opentargets.org",
        "license": "Open Targets Platform data: CC0 1.0; upstream records retain their own terms",
    },
    "Reactome": {
        "url": "https://reactome.org",
        "license": "CC BY 4.0",
    },
    "ClinicalTrials.gov": {
        "url": "https://clinicaltrials.gov",
        "license": "Public registry; review record-level terms and attribution",
    },
    "Europe PMC": {
        "url": "https://europepmc.org",
        "license": "Varies by publication; follow the linked record's terms",
    },
}

CHEMBL_RE = re.compile(r"^CHEMBL\d{1,10}$")
ENSG_RE = re.compile(r"^ENSG\d{11}$")
GENE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-]{0,23}$")

Q_SEARCH = """
query DrugSearch($q: String!) {
  search(queryString: $q, entityNames: ["drug"], page: {index: 0, size: 10}) {
    total
    hits { id entity name description }
  }
}"""

Q_CATALOG_SEARCH = """
query CatalogSearch($q: String!, $entities: [String!], $size: Int!) {
  search(queryString: $q, entityNames: $entities, page: {index: 0, size: $size}) {
    total
    hits { id entity name description }
  }
}"""

Q_DRUG = """
query DrugDetail($id: String!) {
  drug(chemblId: $id) {
    id
    name
    drugType
    maximumClinicalTrialPhase
    maximumClinicalStage
    hasBeenWithdrawn
    description
    mechanismsOfAction {
      uniqueActionTypes
      uniqueTargetTypes
      rows {
        mechanismOfAction
        targetName
        targets { id approvedSymbol }
        references { source urls }
      }
    }
  }
}"""

Q_TARGET_PATHWAYS = """
query TargetPathways($id: String!) {
  target(ensemblId: $id) {
    id
    approvedSymbol
    approvedName
    pathways { pathway pathwayId }
  }
}"""

Q_TARGET_PROTEINS = """
query TargetProteins($id: String!) {
  target(ensemblId: $id) {
    id
    approvedSymbol
    proteinIds { id source }
  }
}"""

Q_TARGET_ASSOCIATIONS = """
query TargetDiseaseScores($id: String!) {
  target(ensemblId: $id) {
    id
    approvedSymbol
    associatedDiseases(page: {index: 0, size: 10}) {
      count
      rows {
        score
        disease { id name }
        datatypeScores { id score }
        datasourceScores { id score }
      }
    }
  }
}"""
