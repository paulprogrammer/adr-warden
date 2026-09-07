import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { EmbeddingEngine, cosineSimilarity } from './embedding.js';
import { calculateContentHash, createChunks, extractTechnicalEntities, parseAdrMarkdown } from './parser.js';
import type {
  AdrDocument,
  DraftAdrInput,
  IndexStats,
  OverlapAnalysis,
  OverlapMatch,
  OverlapVerdict,
  SearchMode,
  SearchResult,
  SectionType,
} from './types.js';
import { VectorStore } from './vector-store.js';
import { AdrKnowledgeGraph } from './graph.js';
import { VocabularyHarvester, type VocabularyTerm } from './vocabulary.js';

export interface AdrEngineOptions {
  cacheDir?: string;
  modelName?: string;
  autoSave?: boolean;
}

export class AdrEngine {
  private vectorStore: VectorStore;
  private embeddingEngine: EmbeddingEngine;
  private cacheDir: string;
  private autoSave: boolean;
  private indexPath: string;

  private knowledgeGraph: AdrKnowledgeGraph;
  private vocabularyHarvester: VocabularyHarvester;

  constructor(options: AdrEngineOptions = {}) {
    this.cacheDir = options.cacheDir || resolve(process.cwd(), '.adr-cache');
    this.autoSave = options.autoSave ?? true;
    this.indexPath = join(this.cacheDir, 'index.json');

    this.vectorStore = new VectorStore();
    this.knowledgeGraph = new AdrKnowledgeGraph();
    this.vocabularyHarvester = new VocabularyHarvester();
    this.embeddingEngine = new EmbeddingEngine({
      cacheDir: this.cacheDir,
      modelName: options.modelName,
    });

    // Try loading persistent index
    if (this.vectorStore.loadFromFile(this.indexPath)) {
      this.knowledgeGraph.buildFromDocuments(this.vectorStore.getAllDocuments());
      this.vocabularyHarvester.buildFromDocuments(this.vectorStore.getAllDocuments());
      this.vectorStore.setVocabularyHarvester(this.vocabularyHarvester);
    }
  }

  public getVectorStore(): VectorStore {
    return this.vectorStore;
  }

  public getEmbeddingEngine(): EmbeddingEngine {
    return this.embeddingEngine;
  }

  public getKnowledgeGraph(): AdrKnowledgeGraph {
    return this.knowledgeGraph;
  }

  public getVocabularyHarvester(): VocabularyHarvester {
    return this.vocabularyHarvester;
  }

  public getVocabulary(): VocabularyTerm[] {
    return this.vocabularyHarvester.getAllTerms();
  }

  public getLineage(id: string) {
    return this.knowledgeGraph.getLineage(id);
  }

  public getImpact(id: string) {
    return this.knowledgeGraph.getImpact(id);
  }

  public getDependencies(id: string) {
    return this.knowledgeGraph.getDependencies(id);
  }

  public validateGraph() {
    return this.knowledgeGraph.validate();
  }

  public getGraphMermaid(options?: { focusId?: string; radius?: number }) {
    return this.knowledgeGraph.toMermaid(options);
  }

  public async indexDirectories(
    directories: string[],
    options: { force?: boolean } = {}
  ): Promise<IndexStats> {
    const startTime = Date.now();
    let totalFiles = 0;
    let indexedFiles = 0;
    let cachedFiles = 0;
    let totalChunks = 0;

    const allMdFiles: string[] = [];
    for (const dir of directories) {
      const resolvedDir = resolve(dir);
      if (!existsSync(resolvedDir)) {
        throw new Error(`Directory does not exist for indexing: ${resolvedDir}`);
      }
      this.findMarkdownFiles(resolvedDir, allMdFiles);
    }

    totalFiles = allMdFiles.length;

    for (const filePath of allMdFiles) {
      const filename = basename(filePath).toLowerCase();
      // Skip known template files
      if (filename.startsWith('template') || filename === 'readme.md') {
        continue;
      }

      const existingDoc = Array.from(this.vectorStore.getAllDocuments()).find(
        (d) => d.filePath === filePath
      );

      const parsed = parseAdrMarkdown(filePath);

      // Check if file is already indexed and hash has not changed
      if (
        !options.force &&
        existingDoc &&
        existingDoc.contentHash === parsed.contentHash
      ) {
        cachedFiles++;
        continue;
      }

      const chunks = createChunks(parsed);

      // Embed chunks
      for (const chunk of chunks) {
        chunk.embedding = await this.embeddingEngine.embed(chunk.text);
      }

      this.vectorStore.addDocument(parsed, chunks);
      indexedFiles++;
      totalChunks += chunks.length;
    }

    // Rebuild knowledge graph relationships from all active documents
    this.knowledgeGraph.buildFromDocuments(this.vectorStore.getAllDocuments());

    // Harvest in-situ vocabulary across repository and synchronize BM25 bonded phrases
    this.vocabularyHarvester.buildFromDocuments(this.vectorStore.getAllDocuments());
    this.vectorStore.setVocabularyHarvester(this.vocabularyHarvester);

    if (this.autoSave) {
      this.saveIndex();
    }

    return {
      totalFiles,
      indexedFiles,
      cachedFiles,
      removedFiles: 0,
      totalChunks: this.vectorStore.getChunkCount(),
      durationMs: Date.now() - startTime,
    };
  }

  public saveIndex(): void {
    this.vectorStore.saveToFile(this.indexPath);
    this.embeddingEngine.saveCache();
  }

  public async search(
    query: string,
    options: {
      topK?: number;
      threshold?: number;
      sectionType?: SectionType;
      statusFilter?: string[];
      mode?: SearchMode;
      bm25Weight?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const mode = options.mode || 'hybrid';
    const queryVector = mode === 'sparse' ? [] : await this.embeddingEngine.embed(query);
    return this.vectorStore.search(queryVector, {
      ...options,
      mode,
      queryText: query,
    });
  }

  public async checkOverlap(
    draft: DraftAdrInput,
    options: { threshold?: number; topK?: number } = {}
  ): Promise<OverlapAnalysis> {
    const threshold = options.threshold ?? 0.5;
    const topK = options.topK ?? 5;

    // Extract draft technical entities for precise architectural matching
    const draftFullText = `${draft.title} ${draft.context} ${draft.decision} ${draft.options || ''} ${draft.drivers || ''}`;
    const draftEntities = extractTechnicalEntities(draftFullText);

    // Synthesize draft representation
    const draftSummaryText = `ADR: ${draft.title}\nContext: ${draft.context}\nDecision: ${draft.decision}`;
    const draftSummaryVector = await this.embeddingEngine.embed(draftSummaryText);
    const draftTitleVector = draft.title.trim()
      ? await this.embeddingEngine.embed(`ADR: ${draft.title}`)
      : draftSummaryVector;
    const draftContextVector = draft.context.trim()
      ? await this.embeddingEngine.embed(draft.context)
      : draftSummaryVector;
    const draftDecisionVector = draft.decision.trim()
      ? await this.embeddingEngine.embed(draft.decision)
      : draftSummaryVector;

    const allDocs = this.vectorStore.getAllDocuments();
    const bm25Index = this.vectorStore.getBm25Index();
    const matches: OverlapMatch[] = [];

    for (const doc of allDocs) {
      const chunks = this.vectorStore.getChunksForDoc(doc.id);
      if (chunks.length === 0) continue;

      const summaryChunk = chunks.find((c) => c.sectionType === 'summary');
      const contextChunk = chunks.find((c) => c.sectionType === 'context');
      const decisionChunk = chunks.find((c) => c.sectionType === 'decision');

      // 0. Title similarity
      const docTitleVector = await this.embeddingEngine.embed(`ADR ${doc.id}: ${doc.metadata.title}`);
      const titleSim = cosineSimilarity(draftTitleVector, docTitleVector);

      // 1. Overall similarity
      let overallSim = 0;
      if (summaryChunk?.embedding) {
        overallSim = cosineSimilarity(draftSummaryVector, summaryChunk.embedding);
      }

      // Also check against individual chunks to see if draft matches any part strongly
      for (const chunk of chunks) {
        if (chunk.embedding) {
          const s = cosineSimilarity(draftSummaryVector, chunk.embedding);
          if (s > overallSim) overallSim = s;
        }
      }

      // 2. Context similarity
      let contextSim = 0;
      if (contextChunk?.embedding) {
        contextSim = cosineSimilarity(draftContextVector, contextChunk.embedding);
      } else if (summaryChunk?.embedding) {
        contextSim = cosineSimilarity(draftContextVector, summaryChunk.embedding);
      }

      // 3. Decision similarity
      let decisionSim = 0;
      if (decisionChunk?.embedding) {
        decisionSim = cosineSimilarity(draftDecisionVector, decisionChunk.embedding);
      } else if (summaryChunk?.embedding) {
        decisionSim = cosineSimilarity(draftDecisionVector, summaryChunk.embedding);
      }

      // 4. Entity and Keyword Attribution
      const docEntities = doc.entities || extractTechnicalEntities(doc.rawContent);
      const sharedEntities = draftEntities.filter((e) => docEntities.includes(e));
      const hasSharedEntity = sharedEntities.length > 0;

      const attribution = bm25Index.attributeTerms(doc.id, draftFullText);
      const matchedTerms = attribution.slice(0, 6).map((a) => a.term);

      // Determine verdict for this particular ADR
      let matchVerdict: OverlapVerdict = 'NOVEL';
      let recommendation = '';

      const isHighTitle = titleSim >= 0.78 || (titleSim >= 0.72 && hasSharedEntity);
      const isHighOverall = overallSim >= 0.75 || (overallSim >= 0.70 && sharedEntities.length >= 2);
      const isHighContext = contextSim >= 0.60 || (contextSim >= 0.55 && hasSharedEntity);
      const isHighDecision = decisionSim >= 0.55;
      const isDivergentDecision = decisionSim < 0.52;

      const isDuplicate =
        (isHighTitle && (overallSim >= 0.55 || contextSim >= 0.40 || decisionSim >= 0.45)) ||
        isHighOverall ||
        (isHighContext && isHighDecision);

      if (isDuplicate) {
        matchVerdict = 'DUPLICATE_RISK';
        const entityText = sharedEntities.length > 0 ? ` (Shared entities: ${sharedEntities.join(', ')})` : '';
        recommendation = `ADR-${doc.id} ('${doc.metadata.title}') directly matches this proposal (${Math.round(titleSim * 100)}% title match, ${Math.round(overallSim * 100)}% overall similarity)${entityText}. Do not create a duplicate ADR; enrich or amend ADR-${doc.id} instead.`;
      } else if (isHighContext && isDivergentDecision) {
        matchVerdict = 'CONFLICT_RISK';
        const entityText = sharedEntities.length > 0 ? ` (Shared technical focus: ${sharedEntities.join(', ')})` : '';
        recommendation = `ADR-${doc.id} ('${doc.metadata.title}') addresses the same problem domain (${Math.round(contextSim * 100)}% context match) but chooses a different architectural direction (${Math.round(decisionSim * 100)}% decision similarity)${entityText}. If superseding this decision, explicitly add 'supersedes: ADR-${doc.id}' and document the deprecation rationale.`;
      } else if (overallSim >= 0.52 || isHighContext || isHighDecision || isHighTitle) {
        matchVerdict = 'EXTENSION_CANDIDATE';
        recommendation = `ADR-${doc.id} ('${doc.metadata.title}') provides related architectural baseline (${Math.round(overallSim * 100)}% overall similarity). Reference or extend ADR-${doc.id} using 'extends: ADR-${doc.id}'.`;
      } else {
        matchVerdict = 'NOVEL';
        recommendation = `Low overlap with ADR-${doc.id} (${Math.round(overallSim * 100)}% similarity).`;
      }

      if (overallSim >= threshold || contextSim >= threshold || decisionSim >= threshold || isHighTitle) {
        matches.push({
          adrId: doc.id,
          title: doc.metadata.title,
          status: doc.metadata.status,
          filePath: doc.filePath,
          overallSimilarity: overallSim,
          contextSimilarity: contextSim,
          decisionSimilarity: decisionSim,
          titleSimilarity: titleSim,
          verdict: matchVerdict,
          matchedExcerpt: doc.summaryText.slice(0, 240) + '...',
          recommendation,
          sharedEntities: sharedEntities.length > 0 ? sharedEntities : undefined,
          matchedTerms: matchedTerms.length > 0 ? matchedTerms : undefined,
        });
      }
    }

    // Sort descending by overall similarity
    matches.sort((a, b) => b.overallSimilarity - a.overallSimilarity);
    const topMatches = matches.slice(0, topK);

    // Compute aggregate analysis verdict
    let verdict: OverlapVerdict = 'NOVEL';
    let summary = 'No significant ADR overlap detected. Proposed architecture appears novel.';
    const actionableGuidance: string[] = [];

    const hasDuplicate = topMatches.some((m) => m.verdict === 'DUPLICATE_RISK');
    const hasConflict = topMatches.some((m) => m.verdict === 'CONFLICT_RISK');
    const hasExtension = topMatches.some((m) => m.verdict === 'EXTENSION_CANDIDATE');

    if (hasDuplicate) {
      verdict = 'DUPLICATE_RISK';
      const prime = topMatches.find((m) => m.verdict === 'DUPLICATE_RISK')!;
      summary = `High duplicate risk with ADR-${prime.adrId} ('${prime.title}'). Both problem statement and proposed decision closely mirror existing records.`;
      actionableGuidance.push(`HALT net-new ADR creation: check if ADR-${prime.adrId} can be updated or enriched directly.`);
      actionableGuidance.push(`Inspect existing record at ${prime.filePath}.`);
      actionableGuidance.push(`If additional scope is necessary, establish an amendment or explicit 'extends' relationship rather than a duplicate standard.`);
    } else if (hasConflict) {
      verdict = 'CONFLICT_RISK';
      const prime = topMatches.find((m) => m.verdict === 'CONFLICT_RISK')!;
      summary = `Architectural conflict detected: draft addresses the problem space of ADR-${prime.adrId} ('${prime.title}') but establishes a diverging decision.`;
      actionableGuidance.push(`Review existing decision in ADR-${prime.adrId} to confirm whether the platform intention is to replace or supersede it.`);
      actionableGuidance.push(`Add 'supersedes: ADR-${prime.adrId}' in metadata if replacing the existing decision.`);
      actionableGuidance.push(`Add migration/transition steps in Consequences section to prevent split-brain runtime architectures.`);
    } else if (hasExtension) {
      verdict = 'EXTENSION_CANDIDATE';
      const prime = topMatches[0];
      summary = `Strong architectural adjacency detected with ADR-${prime.adrId} ('${prime.title}').`;
      actionableGuidance.push(`Add 'extends: ADR-${prime.adrId}' or 'amends: ADR-${prime.adrId}' in your metadata header.`);
      actionableGuidance.push(`Reference ADR-${prime.adrId} in the Context section to ground your architectural continuity.`);
    } else {
      verdict = 'NOVEL';
      summary = 'Proposal represents a distinct, net-new decision without conflicting or redundant prior art.';
      actionableGuidance.push('Proceed with creating the new ADR using the standard MADR template.');
      actionableGuidance.push('Ensure primary source citations and Mermaid diagrams are included.');
    }

    // Surface shared technical entities if any top candidate shares them
    const allSharedEntities = Array.from(new Set(topMatches.flatMap((m) => m.sharedEntities || [])));
    if (allSharedEntities.length > 0 && verdict !== 'NOVEL') {
      actionableGuidance.push(`Shared technical identifiers detected: ${allSharedEntities.join(', ')}.`);
    }

    const confidence = topMatches.length > 0 ? topMatches[0].overallSimilarity : 0.0;

    return {
      verdict,
      confidence,
      summary,
      topMatches,
      actionableGuidance,
    };
  }

  public getAdr(idOrPath: string): AdrDocument | undefined {
    const clean = idOrPath.trim();
    // 1. Match by exact ID
    const byId = this.vectorStore.getDocument(clean);
    if (byId) return byId;

    // 2. Match by normalized numeric ID (e.g. "1" -> "0001" or "001")
    const num = clean.replace(/^[^\d]*/, '');
    for (const doc of this.vectorStore.getAllDocuments()) {
      if (doc.id === clean || doc.id.endsWith(num)) {
        return doc;
      }
      if (doc.filePath.endsWith(clean) || doc.relativePath.endsWith(clean)) {
        return doc;
      }
    }
    return undefined;
  }

  public listAdrs(options: { status?: string } = {}): AdrDocument[] {
    const all = this.vectorStore.getAllDocuments();
    if (options.status) {
      const s = options.status.toLowerCase();
      return all.filter((d) => d.metadata.status.toLowerCase() === s);
    }
    return all.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  private findMarkdownFiles(dir: string, fileList: string[]): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.adr-cache' ||
          entry.name === 'dist' ||
          entry.name === 'legacy_adr' ||
          entry.name === 'legacy'
        ) {
          continue;
        }
        this.findMarkdownFiles(fullPath, fileList);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        fileList.push(fullPath);
      }
    }
  }
}
