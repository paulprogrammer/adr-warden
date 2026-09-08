import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Bm25Index } from './bm25.js';
import { cosineSimilarity } from './embedding.js';
import { VocabularyHarvester } from './vocabulary.js';
import type {
  AdrDocument,
  AdrMetadata,
  SearchMode,
  SearchResult,
  SectionType,
  VectorChunk,
} from './types.js';

export interface SerializedVectorStore {
  version: string;
  createdAt: string;
  documents: Record<string, AdrDocument>;
  chunks: VectorChunk[];
}

export interface SearchOptions {
  topK?: number;
  threshold?: number;
  sectionType?: SectionType;
  statusFilter?: string[];
  mode?: SearchMode;
  queryText?: string;
  bm25Weight?: number;
}

export class VectorStore {
  private documents: Map<string, AdrDocument> = new Map();
  private chunks: VectorChunk[] = [];
  private chunksByDocId: Map<string, VectorChunk[]> = new Map();
  private bm25Index: Bm25Index = new Bm25Index();
  private vocabularyHarvester?: VocabularyHarvester;

  constructor() {}

  public getDocumentCount(): number {
    return this.documents.size;
  }

  public getChunkCount(): number {
    return this.chunks.length;
  }

  public getBm25Index(): Bm25Index {
    return this.bm25Index;
  }

  public setVocabularyHarvester(harvester: VocabularyHarvester): void {
    this.vocabularyHarvester = harvester;
    this.bm25Index.setHarvester(harvester);
    // Re-index all chunks with bonded phrases
    this.bm25Index.clear();
    for (const chunk of this.chunks) {
      this.bm25Index.addChunk(chunk.chunkId, chunk.docId, chunk.sectionType, chunk.text);
    }
  }

  public getVocabularyHarvester(): VocabularyHarvester | undefined {
    return this.vocabularyHarvester;
  }

  public getDocument(id: string): AdrDocument | undefined {
    return this.documents.get(id);
  }

  public getAllDocuments(): AdrDocument[] {
    return Array.from(this.documents.values());
  }

  public getChunksForDoc(id: string): VectorChunk[] {
    return this.chunksByDocId.get(id) || [];
  }

  public addDocument(doc: AdrDocument, chunks: VectorChunk[]): void {
    // Remove existing chunks for doc if any
    this.removeDocument(doc.id);

    this.documents.set(doc.id, doc);
    for (const chunk of chunks) {
      this.chunks.push(chunk);
      this.bm25Index.addChunk(chunk.chunkId, chunk.docId, chunk.sectionType, chunk.text);
    }
    this.chunksByDocId.set(doc.id, chunks);
  }

  public removeDocument(id: string): boolean {
    const existed = this.documents.delete(id);
    if (existed) {
      this.chunks = this.chunks.filter((c) => c.docId !== id);
      this.chunksByDocId.delete(id);
      this.bm25Index.removeDocument(id);
    }
    return existed;
  }

  public search(
    queryVector: number[],
    options: SearchOptions = {}
  ): SearchResult[] {
    const mode = options.mode || 'hybrid';
    const topK = options.topK ?? 5;
    const threshold = options.threshold ?? 0.35;

    if (mode === 'sparse') {
      return this.searchSparse(options.queryText || '', {
        topK,
        threshold,
        sectionType: options.sectionType,
        statusFilter: options.statusFilter,
      });
    }

    if (mode === 'dense') {
      return this.searchDense(queryVector, {
        topK,
        threshold,
        sectionType: options.sectionType,
        statusFilter: options.statusFilter,
      });
    }

    // Default: hybrid
    return this.searchHybrid(queryVector, options.queryText || '', {
      topK,
      threshold,
      sectionType: options.sectionType,
      statusFilter: options.statusFilter,
      bm25Weight: options.bm25Weight,
    });
  }

  private searchDense(
    queryVector: number[],
    options: {
      topK: number;
      threshold: number;
      sectionType?: SectionType;
      statusFilter?: string[];
    }
  ): SearchResult[] {
    if (queryVector.length === 0) return [];

    const scoredChunks: Array<{ chunk: VectorChunk; score: number }> = [];

    for (const chunk of this.chunks) {
      if (!chunk.embedding) continue;
      if (options.sectionType && chunk.sectionType !== options.sectionType) {
        continue;
      }

      const doc = this.documents.get(chunk.docId);
      if (!doc) continue;

      if (options.statusFilter && !options.statusFilter.includes(doc.metadata.status.toLowerCase())) {
        continue;
      }

      const score = cosineSimilarity(queryVector, chunk.embedding);
      if (score >= options.threshold) {
        scoredChunks.push({ chunk, score });
      }
    }

    scoredChunks.sort((a, b) => b.score - a.score);

    const bestMatches = new Map<string, SearchResult>();
    for (const item of scoredChunks) {
      const doc = this.documents.get(item.chunk.docId);
      if (!doc) continue;

      const existing = bestMatches.get(doc.id);
      if (!existing || item.score > existing.score) {
        bestMatches.set(doc.id, {
          id: doc.id,
          title: doc.metadata.title,
          status: doc.metadata.status,
          filePath: doc.filePath,
          score: Math.round(item.score * 1000) / 1000,
          matchedSection: item.chunk.sectionType,
          excerpt: item.chunk.text,
          metadata: doc.metadata,
          denseScore: Math.round(item.score * 1000) / 1000,
        });
      }
    }

    return Array.from(bestMatches.values()).slice(0, options.topK);
  }

  private searchSparse(
    queryText: string,
    options: {
      topK: number;
      threshold: number;
      sectionType?: SectionType;
      statusFilter?: string[];
    }
  ): SearchResult[] {
    if (!queryText.trim()) return [];

    const rawMatches = this.bm25Index.search(queryText, {
      topK: options.topK * 3,
      sectionType: options.sectionType,
    });

    if (rawMatches.length === 0) return [];

    const maxScore = rawMatches[0].score || 1.0;
    const bestMatches = new Map<string, SearchResult>();

    for (const match of rawMatches) {
      const doc = this.documents.get(match.docId);
      if (!doc) continue;

      if (options.statusFilter && !options.statusFilter.includes(doc.metadata.status.toLowerCase())) {
        continue;
      }

      const normalizedScore = maxScore > 0 ? match.score / maxScore : 0;
      if (normalizedScore < options.threshold) continue;

      const existing = bestMatches.get(doc.id);
      if (!existing || normalizedScore > existing.score) {
        bestMatches.set(doc.id, {
          id: doc.id,
          title: doc.metadata.title,
          status: doc.metadata.status,
          filePath: doc.filePath,
          score: Math.round(normalizedScore * 1000) / 1000,
          matchedSection: match.sectionType,
          excerpt: match.excerpt,
          metadata: doc.metadata,
          sparseScore: match.score,
          matchedTerms: match.matchedTerms,
        });
      }
    }

    return Array.from(bestMatches.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  private searchHybrid(
    queryVector: number[],
    queryText: string,
    options: {
      topK: number;
      threshold: number;
      sectionType?: SectionType;
      statusFilter?: string[];
      bm25Weight?: number;
    }
  ): SearchResult[] {
    // 1. Calculate dense similarity for all valid chunks
    const denseScores = new Map<string, number>();
    for (const chunk of this.chunks) {
      if (!chunk.embedding) continue;
      if (options.sectionType && chunk.sectionType !== options.sectionType) {
        continue;
      }

      const doc = this.documents.get(chunk.docId);
      if (!doc) continue;

      if (options.statusFilter && !options.statusFilter.includes(doc.metadata.status.toLowerCase())) {
        continue;
      }

      const score = cosineSimilarity(queryVector, chunk.embedding);
      denseScores.set(chunk.chunkId, score);
    }

    // 2. Calculate sparse BM25 scores
    const sparseRaw = queryText.trim()
      ? this.bm25Index.search(queryText, {
          topK: this.chunks.length,
          sectionType: options.sectionType,
        })
      : [];

    const sparseMap = new Map<string, { score: number; matchedTerms: string[] }>();
    let maxBm25 = 0;
    for (const m of sparseRaw) {
      sparseMap.set(m.chunkId, { score: m.score, matchedTerms: m.matchedTerms });
      if (m.score > maxBm25) maxBm25 = m.score;
    }

    // 3. Build dense rank map and sparse rank map
    const sortedDenseChunks = Array.from(denseScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    const denseRankMap = new Map<string, number>();
    sortedDenseChunks.forEach((chunkId, index) => {
      denseRankMap.set(chunkId, index + 1);
    });

    const sortedSparseChunks = sparseRaw.map((m) => m.chunkId);
    const sparseRankMap = new Map<string, number>();
    sortedSparseChunks.forEach((chunkId, index) => {
      sparseRankMap.set(chunkId, index + 1);
    });

    // 4. Combine candidate chunks using RRF and calibrated score blending
    const RRF_K = 60;
    const sparseWeight = options.bm25Weight ?? 0.30;
    const denseWeight = 1.0 - sparseWeight;

    // Collect all candidate chunk IDs
    const candidateChunkIds = new Set<string>([
      ...denseScores.keys(),
      ...sparseMap.keys(),
    ]);

    interface CandidateEvaluation {
      chunk: VectorChunk;
      doc: AdrDocument;
      rrfScore: number;
      blendedScore: number;
      denseScore: number;
      sparseScore: number;
      matchedTerms: string[];
    }

    const evaluations: CandidateEvaluation[] = [];

    for (const chunkId of candidateChunkIds) {
      const chunk = this.chunks.find((c) => c.chunkId === chunkId);
      if (!chunk) continue;

      const doc = this.documents.get(chunk.docId);
      if (!doc) continue;

      if (options.statusFilter && !options.statusFilter.includes(doc.metadata.status.toLowerCase())) {
        continue;
      }
      if (options.sectionType && chunk.sectionType !== options.sectionType) {
        continue;
      }

      const dScore = denseScores.get(chunkId) ?? 0;
      const sData = sparseMap.get(chunkId);
      const sScore = sData?.score ?? 0;
      const matchedTerms = sData?.matchedTerms ?? [];

      const normSparse = maxBm25 > 0 ? sScore / maxBm25 : 0;

      const dRank = denseRankMap.get(chunkId);
      const sRank = sparseRankMap.get(chunkId);

      const rrfDense = dRank ? 1 / (RRF_K + dRank) : 0;
      const rrfSparse = sRank ? 1 / (RRF_K + sRank) : 0;
      const rrfScore = rrfDense + rrfSparse;

      // Active score blending: ensure semantic score is preserved as baseline,
      // while sparse keyword matches grant a positive boost.
      const blendedScore = dScore > 0
        ? Math.max(dScore, dScore * denseWeight + normSparse * sparseWeight)
        : normSparse;

      if (blendedScore < options.threshold) {
        continue;
      }

      evaluations.push({
        chunk,
        doc,
        rrfScore,
        blendedScore,
        denseScore: dScore,
        sparseScore: sScore,
        matchedTerms,
      });
    }

    // Sort candidate evaluations primarily by RRF, secondary by blendedScore
    evaluations.sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) {
        return b.rrfScore - a.rrfScore;
      }
      return b.blendedScore - a.blendedScore;
    });

    // Group by document to choose the best representative chunk
    const bestByDoc = new Map<string, SearchResult>();

    for (const ev of evaluations) {
      if (!bestByDoc.has(ev.doc.id)) {
        bestByDoc.set(ev.doc.id, {
          id: ev.doc.id,
          title: ev.doc.metadata.title,
          status: ev.doc.metadata.status,
          filePath: ev.doc.filePath,
          score: Math.round(ev.blendedScore * 1000) / 1000,
          matchedSection: ev.chunk.sectionType,
          excerpt: ev.chunk.text,
          metadata: ev.doc.metadata,
          denseScore: ev.denseScore > 0 ? Math.round(ev.denseScore * 1000) / 1000 : undefined,
          sparseScore: ev.sparseScore > 0 ? Math.round(ev.sparseScore * 100) / 100 : undefined,
          matchedTerms: ev.matchedTerms.length > 0 ? ev.matchedTerms : undefined,
        });
      }
    }

    return Array.from(bestByDoc.values()).slice(0, options.topK);
  }

  public saveToFile(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const docsObj: Record<string, AdrDocument> = {};
    for (const [id, doc] of this.documents.entries()) {
      docsObj[id] = doc;
    }

    const payload: SerializedVectorStore = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      documents: docsObj,
      chunks: this.chunks,
    };

    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  public loadFromData(data: SerializedVectorStore): void {
    this.documents.clear();
    this.chunks = [];
    this.chunksByDocId.clear();

    for (const [id, doc] of Object.entries(data.documents)) {
      this.documents.set(id, doc);
    }

    this.bm25Index.clear();
    this.chunks = data.chunks || [];
    for (const chunk of this.chunks) {
      let list = this.chunksByDocId.get(chunk.docId);
      if (!list) {
        list = [];
        this.chunksByDocId.set(chunk.docId, list);
      }
      list.push(chunk);
      this.bm25Index.addChunk(chunk.chunkId, chunk.docId, chunk.sectionType, chunk.text);
    }
  }

  public loadFromFile(filePath: string): boolean {
    if (!existsSync(filePath)) return false;

    try {
      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content) as SerializedVectorStore;
      this.loadFromData(data);
      return true;
    } catch (err) {
      throw new Error(`Failed to load vector store from ${filePath}: ${(err as Error).message}`);
    }
  }
}
