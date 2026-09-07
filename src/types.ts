export type AdrStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'deprecated'
  | 'superseded'
  | string;

export interface AdrMetadata {
  id: string;
  title: string;
  status: AdrStatus;
  date?: string;
  deciders?: string[];
  technicalStory?: string;
  supersedes?: string[];
  supersededBy?: string[];
  extends?: string[];
  amends?: string[];
  dependsOn?: string[];
  requiredBy?: string[];
  category?: string;
  tags?: string[];
}

export type RelationType =
  | 'OBSOLETES'
  | 'OBSOLETED_BY'
  | 'EXTENDS'
  | 'EXTENDED_BY'
  | 'AMENDS'
  | 'AMENDED_BY'
  | 'DEPENDS_ON'
  | 'REQUIRED_BY'
  | 'REFERENCES'
  | 'REFERENCED_BY';

export interface AdrNode {
  id: string;
  title: string;
  status: AdrStatus;
  date?: string;
  category?: string;
  filePath: string;
  catalog: 'target' | 'legacy' | 'default';
}

export interface AdrEdge {
  source: string;
  target: string;
  type: RelationType;
  explicit: boolean;
  description?: string;
}

export interface LineageStep {
  fromId: string;
  toId: string;
  relation: RelationType;
  date?: string;
}

export interface LineageReport {
  targetId: string;
  activeStandardId: string;
  isActive: boolean;
  ancestors: string[];
  successors: string[];
  timeline: LineageStep[];
  summary: string;
}

export interface ImpactReport {
  targetId: string;
  targetTitle: string;
  directDependents: Array<{ id: string; title: string; relation: RelationType }>;
  transitiveDependents: Array<{ id: string; title: string; depth: number }>;
  extensions: Array<{ id: string; title: string; relation: RelationType }>;
  citations: Array<{ id: string; title: string }>;
  blastRadiusScore: number;
  advisory: string[];
}

export type ValidationSeverity = 'error' | 'warning';

export type ValidationCode =
  | 'DANGLING_REFERENCE'
  | 'CYCLE_DETECTED'
  | 'STATUS_CONTRADICTION'
  | 'ORPHAN_RECORD';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: ValidationCode;
  message: string;
  nodeIds: string[];
  remediation: string;
}

export interface GraphValidationReport {
  valid: boolean;
  totalNodes: number;
  totalEdges: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: string;
}

export interface AdrSections {
  context: string;
  decisionDrivers?: string;
  consideredOptions?: string;
  decision: string;
  consequences?: string;
  diagrams?: string[];
}

export interface AdrDocument {
  id: string;
  filePath: string;
  relativePath: string;
  contentHash: string;
  mtime: number;
  metadata: AdrMetadata;
  sections: AdrSections;
  rawContent: string;
  summaryText: string;
  inlineReferences?: string[];
  entities?: string[];
}

export type SectionType = 'summary' | 'context' | 'decision' | 'options';
export type SearchMode = 'hybrid' | 'dense' | 'sparse';

export interface VectorChunk {
  chunkId: string;
  docId: string;
  sectionType: SectionType;
  text: string;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  title: string;
  status: AdrStatus;
  filePath: string;
  score: number;
  matchedSection: SectionType;
  excerpt: string;
  metadata: AdrMetadata;
  denseScore?: number;
  sparseScore?: number;
  matchedTerms?: string[];
}

export type OverlapVerdict =
  | 'DUPLICATE_RISK'
  | 'CONFLICT_RISK'
  | 'EXTENSION_CANDIDATE'
  | 'NOVEL';

export interface OverlapMatch {
  adrId: string;
  title: string;
  status: AdrStatus;
  filePath: string;
  overallSimilarity: number;
  contextSimilarity: number;
  decisionSimilarity: number;
  titleSimilarity?: number;
  verdict: OverlapVerdict;
  matchedExcerpt: string;
  recommendation: string;
  sharedEntities?: string[];
  matchedTerms?: string[];
}

export interface OverlapAnalysis {
  verdict: OverlapVerdict;
  confidence: number;
  summary: string;
  topMatches: OverlapMatch[];
  actionableGuidance: string[];
}

export interface DraftAdrInput {
  title: string;
  context: string;
  decision: string;
  options?: string;
  drivers?: string;
}

export interface IndexStats {
  totalFiles: number;
  indexedFiles: number;
  cachedFiles: number;
  removedFiles: number;
  totalChunks: number;
  durationMs: number;
}
