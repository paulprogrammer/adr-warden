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
  category?: string;
  tags?: string[];
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
}

export type SectionType = 'summary' | 'context' | 'decision' | 'options';

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
