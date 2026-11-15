/**
 * Shared TypeScript contracts for the Pharma Research Data Bank UI.
 * Keep aligned with backend pharma_schemas / route responses.
 * Prefer these over `any` when adding or editing Pharma panels.
 */

export type PharmaLang = string | undefined;

/** Authenticated API helper injected from the app shell. */
export type PharmaCall = (path: string, init?: RequestInit) => Promise<unknown>;

export type PharmaNotify = (message: string, kind?: "error" | "ok") => void;

export type SourceRef = {
  source: string;
  url: string;
};

export type PharmaTarget = {
  ensembl_id: string;
  symbol: string;
  mechanisms: string[];
  references: SourceRef[];
  url: string;
};

export type PharmaMechanism = {
  mechanism: string;
  target_name: string;
  targets: { symbol: string; ensembl_id?: string }[];
  references: SourceRef[];
};

export type PharmaDrug = {
  id: string;
  name: string;
  drug_type: string;
  max_clinical_phase: number | null;
  clinical_stage?: string | null;
  withdrawn: boolean | null;
  description: string;
  action_types: string[];
  mechanisms: PharmaMechanism[];
  targets: PharmaTarget[];
  url: string;
};

export type PharmaOrg = {
  id: string;
  name: string;
  role: string;
};

export type PharmaGeneOrigin = "open_targets" | "user";

export type PharmaProjectGene = {
  symbol: string;
  ensembl_id?: string | null;
  origin: PharmaGeneOrigin;
};

export type PharmaPathwayRef = {
  id: string;
  name: string;
  url?: string;
};

export type PharmaProject = {
  id: string;
  name: string;
  drug_name?: string;
  drug_chembl_id?: string;
  organism?: string;
  model_system?: string;
  dose_text?: string;
  duration_text?: string;
  hypothesis?: string;
  genes?: PharmaProjectGene[];
  pathways?: PharmaPathwayRef[];
  created_at?: string;
  evidence?: {
    retrieved_at?: string;
    source?: { provider?: string; license?: string };
  };
};

export type CatalogKind =
  | "all"
  | "drug"
  | "target"
  | "disease"
  | "pathway"
  | "trial"
  | "publication";

export type CatalogItem = {
  id: string;
  type: Exclude<CatalogKind, "all">;
  title: string;
  summary?: string;
  url: string;
  provider: string;
  license?: string;
  retrieved_at?: string;
};

export type CatalogSourceMeta = {
  provider: string;
  url?: string;
  license?: string;
  retrieved_at?: string;
};

export type CatalogSourceError = {
  provider: string;
  message?: string;
};

export type LibraryItem = {
  id: string;
  kind: string;
  source_id: string;
  title: string;
  summary?: string;
  url: string;
  provider: string;
  license?: string;
  retrieved_at?: string;
  created_at?: string;
  can_delete?: boolean;
};

export type AccessStatus =
  | "loading"
  | "login"
  | "not_requested"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked"
  | "error";

export type AccessStatusResponse = {
  status: AccessStatus | string;
  is_admin?: boolean;
};

export type AccessRequestRow = {
  user_id: number;
  email?: string;
  organization_name: string;
  purpose: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type IntelligenceSource = {
  provider: string;
  data: unknown;
  error: string | null;
  retrieved_at: string | null;
};

export type DockingStatus = {
  enabled: boolean;
  engine_available: boolean;
  ready: boolean;
  timeout_seconds: number;
};

export type DockingResult = {
  engine: string;
  engine_version: string;
  energy_units: string;
  scores: number[];
  poses_pdbqt: string;
  center: number[];
  size: number[];
  seed: number;
  exhaustiveness: number;
  requested_poses: number;
  receptor_sha256: string;
  ligand_sha256: string;
  cpu: number;
  scoring: string;
  completed_at: string;
  energy_range_kcal_mol: number;
};

export type StructureEntry = {
  id: string;
  title: string;
  method: string;
  resolution_angstrom: number | null;
  release_date: string;
  revision_date: string;
  citation_title: string;
  doi: string;
  doi_url: string;
  source_url: string;
  coordinate_url: string;
  retrieved_at: string;
  cif: string;
};

export type PharmaResearchTabProps = {
  call: PharmaCall;
  notify: PharmaNotify;
  lang?: string;
  onDesignGene?: (symbol: string) => void;
  onOpenQpcr?: () => void;
};
