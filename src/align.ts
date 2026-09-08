import { basename } from 'node:path';
import type { AdrEngine } from './engine.js';
import type { AdrRemoteResolver, AdrUrlInfo } from './remote/types.js';
import type { ParsedChangeset } from './changeset.js';
import type { AdrDocument } from './types.js';

export type AlignmentClassification = 'binding' | 'advisory' | 'historical';

export interface AdrAlignmentMatch {
  adrId: string;
  title: string;
  status: string;
  classification: AlignmentClassification;
  score: number;
  matchedFiles: string[];
  matchedKeywords: string[];
  excerpt: string;
  decision: string;
  context: string;
  webUrl?: string;
  rawUrl?: string;
  observations: string[];
}

export interface ChangesetAlignmentReport {
  timestamp: string;
  targetChangeset: {
    filesCount: number;
    files: string[];
    dependenciesCount: number;
  };
  bindingStandards: AdrAlignmentMatch[]; // Status: accepted / active
  inFlightProposals: AdrAlignmentMatch[]; // Status: proposed
  historicalMatches: AdrAlignmentMatch[]; // Status: superseded / deprecated
  summary: string;
}

export interface AlignOptions {
  threshold?: number;
  topK?: number;
  resolver?: AdrRemoteResolver;
}

export class ChangesetAligner {
  public static async evaluate(
    changeset: ParsedChangeset,
    engine: AdrEngine,
    options: AlignOptions = {}
  ): Promise<ChangesetAlignmentReport> {
    const threshold = options.threshold ?? 0.32;
    const topK = options.topK ?? 8;
    const resolver = options.resolver;

    const queries: string[] = [];

    // 1. Primary summary query
    if (changeset.summaryText.trim()) {
      queries.push(changeset.summaryText);
    }

    // 2. Focused dependency query
    if (changeset.touchedDependencies.length > 0) {
      queries.push(
        `Dependencies: ${changeset.touchedDependencies.map((d) => d.name).join(', ')}`
      );
    }

    // 3. Keyword-focused query
    if (changeset.extractedKeywords.length > 0) {
      queries.push(
        `Architecture topics: ${changeset.extractedKeywords.slice(0, 10).join(' ')}`
      );
    }

    // Accumulate matches across search queries
    const matchMap = new Map<
      string,
      {
        doc: AdrDocument;
        score: number;
        matchedExcerpt: string;
        matchedTerms: Set<string>;
      }
    >();

    for (const q of queries) {
      const results = await engine.search(q, {
        topK: 10,
        threshold,
        mode: 'hybrid',
      });

      for (const res of results) {
        const doc = engine.getVectorStore().getDocument(res.id);
        if (!doc) continue;

        const existing = matchMap.get(res.id);
        const terms = new Set(res.matchedTerms || []);

        if (!existing || res.score > existing.score) {
          if (existing) {
            for (const t of existing.matchedTerms) terms.add(t);
          }
          matchMap.set(res.id, {
            doc,
            score: res.score,
            matchedExcerpt: res.excerpt,
            matchedTerms: terms,
          });
        } else {
          for (const t of terms) existing.matchedTerms.add(t);
        }
      }
    }

    const bindingStandards: AdrAlignmentMatch[] = [];
    const inFlightProposals: AdrAlignmentMatch[] = [];
    const historicalMatches: AdrAlignmentMatch[] = [];

    const sortedEntries = Array.from(matchMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    for (const entry of sortedEntries) {
      const { doc, score, matchedExcerpt, matchedTerms } = entry;
      const statusLower = doc.metadata.status.toLowerCase();

      let classification: AlignmentClassification = 'binding';
      if (['proposed', 'draft', 'in-review', 'under-review'].includes(statusLower)) {
        classification = 'advisory';
      } else if (['superseded', 'deprecated', 'rejected', 'obsolete'].includes(statusLower)) {
        classification = 'historical';
      }

      // Check which changeset files match ADR content or entities
      const matchedFiles: string[] = [];
      const docTextLower = `${doc.metadata.title} ${doc.sections.context} ${doc.sections.decision}`.toLowerCase();

      for (const file of changeset.files) {
        const base = basename(file.path).toLowerCase();
        const baseNoExt = base.replace(/\.[^.]+$/, '');
        if (
          docTextLower.includes(file.path.toLowerCase()) ||
          docTextLower.includes(base) ||
          (baseNoExt.length > 3 && docTextLower.includes(baseNoExt))
        ) {
          matchedFiles.push(file.path);
        }
      }

      // Check which dependencies match
      for (const dep of changeset.touchedDependencies) {
        if (docTextLower.includes(dep.name.toLowerCase())) {
          matchedTerms.add(dep.name);
        }
      }

      const observations: string[] = [];

      if (classification === 'binding') {
        observations.push(
          `Mandatory architectural baseline: verify that changes strictly adhere to the decision in ADR-${doc.id}.`
        );
        if (matchedFiles.length > 0) {
          observations.push(`Governs modified files: ${matchedFiles.slice(0, 3).join(', ')}`);
        }
        if (doc.sections.decision) {
          observations.push(
            `Core Decision: "${doc.sections.decision.slice(0, 200).replace(/\n/g, ' ')}..."`
          );
        }
      } else if (classification === 'advisory') {
        observations.push(
          `Pending architectural proposal: this changeset intersects with an unaccepted ADR. Review proposal to avoid near-term rework.`
        );
        if (doc.metadata.technicalStory) {
          observations.push(`Intent: ${doc.metadata.technicalStory}`);
        }
      } else if (classification === 'historical') {
        const lineage = engine.getKnowledgeGraph().getLineage(doc.id);
        if (lineage.activeStandardId && lineage.activeStandardId !== doc.id) {
          observations.push(
            `CAUTION: ADR-${doc.id} is ${doc.metadata.status.toUpperCase()}. Active successor standard is ADR-${lineage.activeStandardId}. Do not write new code against superseded rules.`
          );
        } else {
          observations.push(`Note: ADR-${doc.id} is marked ${doc.metadata.status.toUpperCase()}.`);
        }
      }

      let urls: AdrUrlInfo | undefined;
      if (resolver) {
        urls = resolver.resolveUrls(doc.id, doc.relativePath || doc.filePath);
      }

      const matchObj: AdrAlignmentMatch = {
        adrId: doc.id,
        title: doc.metadata.title,
        status: doc.metadata.status,
        classification,
        score: Math.round(score * 1000) / 1000,
        matchedFiles,
        matchedKeywords: Array.from(matchedTerms),
        excerpt: matchedExcerpt,
        decision: doc.sections.decision,
        context: doc.sections.context,
        webUrl: urls?.webUrl,
        rawUrl: urls?.rawUrl,
        observations,
      };

      if (classification === 'binding') {
        bindingStandards.push(matchObj);
      } else if (classification === 'advisory') {
        inFlightProposals.push(matchObj);
      } else {
        historicalMatches.push(matchObj);
      }
    }

    const summary = `Evaluated changeset of ${changeset.files.length} files against architecture decision catalog: found ${bindingStandards.length} binding standards, ${inFlightProposals.length} proposed advisories, and ${historicalMatches.length} historical records.`;

    return {
      timestamp: new Date().toISOString(),
      targetChangeset: {
        filesCount: changeset.files.length,
        files: changeset.files.map((f) => f.path),
        dependenciesCount: changeset.touchedDependencies.length,
      },
      bindingStandards,
      inFlightProposals,
      historicalMatches,
      summary,
    };
  }
}
