import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cosineSimilarity } from './embedding.js';
import type {
  AdrDocument,
  AdrMetadata,
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
}

export class VectorStore {
  private documents: Map<string, AdrDocument> = new Map();
  private chunks: VectorChunk[] = [];
  private chunksByDocId: Map<string, VectorChunk[]> = new Map();

  constructor() {}

  public getDocumentCount(): number {
    return this.documents.size;
  }

  public getChunkCount(): number {
    return this.chunks.length;
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
    }
    this.chunksByDocId.set(doc.id, chunks);
  }

  public removeDocument(id: string): boolean {
    const existed = this.documents.delete(id);
    if (existed) {
      this.chunks = this.chunks.filter((c) => c.docId !== id);
      this.chunksByDocId.delete(id);
    }
    return existed;
  }

  public search(queryVector: number[], options: SearchOptions = {}): SearchResult[] {
    const topK = options.topK ?? 5;
    const threshold = options.threshold ?? 0.3;
    const statusFilter = options.statusFilter?.map((s) => s.toLowerCase());

    // Map docId -> best match result
    const bestMatches = new Map<string, SearchResult>();

    for (const chunk of this.chunks) {
      if (!chunk.embedding) continue;
      if (options.sectionType && chunk.sectionType !== options.sectionType) {
        continue;
      }

      const doc = this.documents.get(chunk.docId);
      if (!doc) continue;

      if (statusFilter && !statusFilter.includes(doc.metadata.status.toLowerCase())) {
        continue;
      }

      const score = cosineSimilarity(queryVector, chunk.embedding);
      if (score < threshold) continue;

      const existing = bestMatches.get(doc.id);
      if (!existing || score > existing.score) {
        bestMatches.set(doc.id, {
          id: doc.id,
          title: doc.metadata.title,
          status: doc.metadata.status,
          filePath: doc.filePath,
          score,
          matchedSection: chunk.sectionType,
          excerpt: chunk.text,
          metadata: doc.metadata,
        });
      }
    }

    return Array.from(bestMatches.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
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

  public loadFromFile(filePath: string): boolean {
    if (!existsSync(filePath)) return false;

    try {
      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content) as SerializedVectorStore;

      this.documents.clear();
      this.chunks = [];
      this.chunksByDocId.clear();

      for (const [id, doc] of Object.entries(data.documents)) {
        this.documents.set(id, doc);
      }

      this.chunks = data.chunks || [];
      for (const chunk of this.chunks) {
        let list = this.chunksByDocId.get(chunk.docId);
        if (!list) {
          list = [];
          this.chunksByDocId.set(chunk.docId, list);
        }
        list.push(chunk);
      }
      return true;
    } catch (err) {
      throw new Error(`Failed to load vector store from ${filePath}: ${(err as Error).message}`);
    }
  }
}
