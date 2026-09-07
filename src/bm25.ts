import type { SectionType } from './types.js';

export interface Bm25ChunkEntry {
  chunkId: string;
  docId: string;
  sectionType: SectionType;
  text: string;
  tokens: string[];
  termCounts: Map<string, number>;
  length: number;
}

export interface Bm25SearchResult {
  chunkId: string;
  docId: string;
  sectionType: SectionType;
  score: number;
  matchedTerms: string[];
  excerpt: string;
}

export const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most',
  'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours', 'yourself',
  'yourselves'
]);

export interface TokenizeOptions {
  harvester?: { bondPhrases: (text: string) => string };
  emitSubtokens?: boolean;
}

export function tokenize(text: string, options?: TokenizeOptions): string[] {
  let processed = text;
  if (options?.harvester) {
    processed = options.harvester.bondPhrases(text);
  }

  const normalized = processed
    .toLowerCase()
    .replace(/[`*_~#\[\]()<>]/g, ' ')
    .replace(/[^a-z0-9\-_]/g, ' ');

  const rawTokens = normalized.split(/[\s,.;:!?/\\|]+/);
  const tokens: string[] = [];

  for (const t of rawTokens) {
    const trimmed = t.replace(/^[-_]+|[-_]+$/g, '');
    if (trimmed.length >= 2 && !STOP_WORDS.has(trimmed)) {
      tokens.push(trimmed);

      // If this was a bonded compound token (e.g. "service_mesh"), also emit its sub-tokens
      if (trimmed.includes('_') && (options?.emitSubtokens ?? true)) {
        const subWords = trimmed.split('_').filter(Boolean);
        for (const sw of subWords) {
          if (sw.length >= 2 && !STOP_WORDS.has(sw)) {
            tokens.push(sw);
          }
        }
      }
    }
  }

  return tokens;
}

export interface Bm25Options {
  k1?: number; // Term frequency saturation parameter (default: 1.2)
  b?: number;  // Document length normalization parameter (default: 0.75)
}

export class Bm25Index {
  private k1: number;
  private b: number;

  private entries: Map<string, Bm25ChunkEntry> = new Map();
  private docIdToChunkIds: Map<string, Set<string>> = new Map();
  // Inverted index: term -> Map<chunkId, termFrequency>
  private invertedIndex: Map<string, Map<string, number>> = new Map();
  private totalTokens = 0;
  private harvester?: { bondPhrases: (text: string) => string };

  constructor(options: Bm25Options = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
  }

  public setHarvester(harvester?: { bondPhrases: (text: string) => string }): void {
    this.harvester = harvester;
  }

  public getHarvester(): { bondPhrases: (text: string) => string } | undefined {
    return this.harvester;
  }

  public getChunkCount(): number {
    return this.entries.size;
  }

  public getAverageLength(): number {
    return this.entries.size > 0 ? this.totalTokens / this.entries.size : 0;
  }

  public clear(): void {
    this.entries.clear();
    this.docIdToChunkIds.clear();
    this.invertedIndex.clear();
    this.totalTokens = 0;
  }

  public addChunk(chunkId: string, docId: string, sectionType: SectionType, text: string): void {
    if (this.entries.has(chunkId)) {
      this.removeChunk(chunkId);
    }

    const tokens = tokenize(text, { harvester: this.harvester });
    const termCounts = new Map<string, number>();

    for (const t of tokens) {
      termCounts.set(t, (termCounts.get(t) || 0) + 1);
    }

    const entry: Bm25ChunkEntry = {
      chunkId,
      docId,
      sectionType,
      text,
      tokens,
      termCounts,
      length: tokens.length,
    };

    this.entries.set(chunkId, entry);
    this.totalTokens += tokens.length;

    let docChunks = this.docIdToChunkIds.get(docId);
    if (!docChunks) {
      docChunks = new Set();
      this.docIdToChunkIds.set(docId, docChunks);
    }
    docChunks.add(chunkId);

    // Update inverted index
    for (const [term, count] of termCounts.entries()) {
      let postings = this.invertedIndex.get(term);
      if (!postings) {
        postings = new Map();
        this.invertedIndex.set(term, postings);
      }
      postings.set(chunkId, count);
    }
  }

  public removeChunk(chunkId: string): boolean {
    const entry = this.entries.get(chunkId);
    if (!entry) return false;

    this.totalTokens -= entry.length;
    this.entries.delete(chunkId);

    const docChunks = this.docIdToChunkIds.get(entry.docId);
    if (docChunks) {
      docChunks.delete(chunkId);
      if (docChunks.size === 0) {
        this.docIdToChunkIds.delete(entry.docId);
      }
    }

    // Clean inverted index
    for (const term of entry.termCounts.keys()) {
      const postings = this.invertedIndex.get(term);
      if (postings) {
        postings.delete(chunkId);
        if (postings.size === 0) {
          this.invertedIndex.delete(term);
        }
      }
    }

    return true;
  }

  public removeDocument(docId: string): void {
    const chunkIds = this.docIdToChunkIds.get(docId);
    if (!chunkIds) return;

    for (const chunkId of Array.from(chunkIds)) {
      this.removeChunk(chunkId);
    }
  }

  /**
   * Robertson-Spärck Jones IDF with 0.5 smoothing.
   */
  public idf(term: string): number {
    const postings = this.invertedIndex.get(term);
    const df = postings ? postings.size : 0;
    const n = this.entries.size;
    if (n === 0) return 0;
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  public search(
    query: string,
    options: {
      topK?: number;
      sectionType?: SectionType;
      docIds?: string[];
    } = {}
  ): Bm25SearchResult[] {
    const queryTokens = tokenize(query, { harvester: this.harvester });
    if (queryTokens.length === 0 || this.entries.size === 0) {
      return [];
    }

    const avgdl = this.getAverageLength();
    if (avgdl === 0) return [];

    const allowedDocIds = options.docIds ? new Set(options.docIds) : null;
    const scores = new Map<string, { score: number; matchedTerms: string[] }>();

    // Unique query terms to avoid overcounting IDF per term
    const uniqueQueryTerms = Array.from(new Set(queryTokens));

    for (const term of uniqueQueryTerms) {
      const postings = this.invertedIndex.get(term);
      if (!postings) continue;

      const termIdf = this.idf(term);
      if (termIdf <= 0) continue;

      for (const [chunkId, tf] of postings.entries()) {
        const entry = this.entries.get(chunkId);
        if (!entry) continue;

        if (options.sectionType && entry.sectionType !== options.sectionType) {
          continue;
        }
        if (allowedDocIds && !allowedDocIds.has(entry.docId)) {
          continue;
        }

        const docLength = entry.length;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / avgdl));
        const termScore = termIdf * (numerator / denominator);

        const current = scores.get(chunkId) || { score: 0, matchedTerms: [] };
        current.score += termScore;
        current.matchedTerms.push(term);
        scores.set(chunkId, current);
      }
    }

    const results: Bm25SearchResult[] = [];
    for (const [chunkId, { score, matchedTerms }] of scores.entries()) {
      const entry = this.entries.get(chunkId);
      if (!entry) continue;

      results.push({
        chunkId,
        docId: entry.docId,
        sectionType: entry.sectionType,
        score,
        matchedTerms,
        excerpt: entry.text,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return options.topK ? results.slice(0, options.topK) : results;
  }

  /**
   * Explainable term attribution for a document against a given query.
   */
  public attributeTerms(docId: string, query: string): Array<{ term: string; idf: number; count: number }> {
    const queryTokens = Array.from(new Set(tokenize(query, { harvester: this.harvester })));
    const chunkIds = this.docIdToChunkIds.get(docId);
    if (!chunkIds || queryTokens.length === 0) return [];

    const termSummary = new Map<string, { idf: number; count: number }>();

    for (const chunkId of chunkIds) {
      const entry = this.entries.get(chunkId);
      if (!entry) continue;

      for (const term of queryTokens) {
        const count = entry.termCounts.get(term) || 0;
        if (count > 0) {
          const existing = termSummary.get(term) || { idf: this.idf(term), count: 0 };
          existing.count += count;
          termSummary.set(term, existing);
        }
      }
    }

    return Array.from(termSummary.entries())
      .map(([term, data]) => ({ term, ...data }))
      .sort((a, b) => b.idf * b.count - a.idf * a.count);
  }
}
