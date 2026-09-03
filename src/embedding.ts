import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface EmbeddingEngineOptions {
  modelName?: string;
  cacheDir?: string;
  dimensions?: number;
}

export class EmbeddingEngine {
  private modelName: string;
  private cacheDir?: string;
  private cacheFile?: string;
  private memoryCache: Map<string, number[]> = new Map();
  private dirty = false;
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(options: EmbeddingEngineOptions = {}) {
    this.modelName = options.modelName || 'Xenova/all-MiniLM-L6-v2';
    if (options.cacheDir) {
      this.cacheDir = options.cacheDir;
      this.cacheFile = join(this.cacheDir, 'embeddings-cache.json');
      this.loadCache();
    }
  }

  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline(
        'feature-extraction',
        this.modelName
      ) as Promise<FeatureExtractionPipeline>;
    }
    return this.extractorPromise;
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text.trim(), 'utf8').digest('hex');
  }

  private loadCache(): void {
    if (!this.cacheFile || !existsSync(this.cacheFile)) return;
    try {
      const data = readFileSync(this.cacheFile, 'utf8');
      const parsed = JSON.parse(data) as Record<string, number[]>;
      for (const [key, vector] of Object.entries(parsed)) {
        this.memoryCache.set(key, vector);
      }
    } catch {
      // In case of corrupt cache file, start with a fresh memory cache
      this.memoryCache.clear();
    }
  }

  public saveCache(): void {
    if (!this.dirty || !this.cacheFile || !this.cacheDir) return;
    try {
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true });
      }
      const obj: Record<string, number[]> = {};
      for (const [key, vector] of this.memoryCache.entries()) {
        obj[key] = vector;
      }
      writeFileSync(this.cacheFile, JSON.stringify(obj), 'utf8');
      this.dirty = false;
    } catch (err) {
      throw new Error(`Failed to persist embedding cache to ${this.cacheFile}: ${(err as Error).message}`);
    }
  }

  public async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Cannot embed empty or whitespace-only text');
    }

    const hash = this.hashText(trimmed);
    const cached = this.memoryCache.get(hash);
    if (cached) {
      return cached;
    }

    const extractor = await this.getExtractor();
    const output = await extractor(trimmed, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array);

    this.memoryCache.set(hash, vector);
    this.dirty = true;
    return vector;
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    this.saveCache();
    return results;
  }

  public getCacheSize(): number {
    return this.memoryCache.size;
  }
}

export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch in cosine similarity calculation: ${a.length} vs ${b.length}`
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  // Clamped for floating-point inaccuracy
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.min(Math.max(similarity, -1), 1);
}
