import { STOP_WORDS } from './bm25.js';
import type { AdrDocument } from './types.js';

export type TermSource =
  | 'code_span'
  | 'header'
  | 'option_title'
  | 'title_case'
  | 'acronym'
  | 'clause_shingle';

export interface VocabularyTerm {
  term: string;               // Canonical bonded identifier, e.g. "service_mesh"
  rawPhrase: string;          // Normalized lowercase space-separated phrase, e.g. "service mesh"
  displayName: string;        // Formatted human-readable display, e.g. "Service Mesh"
  docCount: number;           // Number of documents containing this term
  totalOccurrences: number;   // Total frequency across all documents
  sources: TermSource[];      // Extractor sources that registered this term
  docIds: string[];           // IDs of documents containing the term
}

interface TermAccumulator {
  rawPhrase: string;
  displayName: string;
  totalOccurrences: number;
  sources: Set<TermSource>;
  docIds: Set<string>;
}

const COMMON_SENTENCE_STARTERS = new Set([
  'in order',
  'because of',
  'this decision',
  'we recommend',
  'as a',
  'if the',
  'when the',
  'for example',
  'on the',
  'to ensure',
  'based on',
  'in addition',
  'due to',
  'such as',
  'with the',
  'at the',
  'it is',
  'there is',
  'there are',
]);

const GENERIC_DISALLOWED_TOKENS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'todo',
  'fixme',
  'tbd',
  'status',
  'decision',
  'context',
  'consequences',
  'options',
  'proposed',
  'accepted',
  'rejected',
  'deprecated',
  'superseded',
]);

export function cleanPhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[`*_~#\[\]()<>]/g, ' ')
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toBondedToken(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function toDisplayName(phrase: string): string {
  return phrase
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 4 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export class VocabularyHarvester {
  private terms: Map<string, VocabularyTerm> = new Map();
  private phraseToBondedMap: Map<string, string> = new Map();
  private bondedToPhraseMap: Map<string, string> = new Map();
  private compiledPhraseRegex: RegExp | null = null;

  constructor() {}

  public getTermCount(): number {
    return this.terms.size;
  }

  public getAllTerms(): VocabularyTerm[] {
    return Array.from(this.terms.values()).sort((a, b) => {
      if (b.docCount !== a.docCount) {
        return b.docCount - a.docCount;
      }
      return b.totalOccurrences - a.totalOccurrences;
    });
  }

  public getTerm(termOrPhrase: string): VocabularyTerm | undefined {
    const bonded = toBondedToken(termOrPhrase);
    return this.terms.get(bonded);
  }

  public getBondedPhraseMap(): Map<string, string> {
    return this.phraseToBondedMap;
  }

  public buildFromDocuments(docs: AdrDocument[]): VocabularyHarvester {
    this.terms.clear();
    this.phraseToBondedMap.clear();
    this.bondedToPhraseMap.clear();
    this.compiledPhraseRegex = null;

    const accumulators = new Map<string, TermAccumulator>();

    for (const doc of docs) {
      const docCandidates = this.extractCandidatesFromDocument(doc);
      for (const { phrase, source } of docCandidates) {
        const cleaned = cleanPhrase(phrase);
        if (!cleaned || cleaned.length < 2 || cleaned.length > 50) continue;

        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length === 0 || words.length > 4) continue;

        // Skip single-word stopwords or generic programming primitives
        if (words.length === 1 && (STOP_WORDS.has(words[0]) || GENERIC_DISALLOWED_TOKENS.has(words[0]))) {
          continue;
        }

        // Skip sentence starter phrases
        if (COMMON_SENTENCE_STARTERS.has(cleaned)) {
          continue;
        }

        // Must contain at least one alphanumeric character
        if (!/[a-z0-9]/.test(cleaned)) continue;

        const bonded = toBondedToken(cleaned);
        if (!bonded) continue;

        let acc = accumulators.get(bonded);
        if (!acc) {
          acc = {
            rawPhrase: cleaned,
            displayName: toDisplayName(cleaned),
            totalOccurrences: 0,
            sources: new Set(),
            docIds: new Set(),
          };
          accumulators.set(bonded, acc);
        }

        acc.totalOccurrences += 1;
        acc.sources.add(source);
        acc.docIds.add(doc.id);
      }
    }

    // Admission criteria for in-situ canonical vocabulary
    for (const [bonded, acc] of accumulators.entries()) {
      const words = acc.rawPhrase.split(/\s+/).filter(Boolean);
      const isMultiWord = words.length >= 2;
      const isStructural = acc.sources.has('code_span') || acc.sources.has('header') || acc.sources.has('option_title');
      const isAcronym = acc.sources.has('acronym');
      const isRepeatedAcrossDocs = acc.docIds.size >= 2;
      const isFrequentInDoc = acc.totalOccurrences >= 3;

      const shouldAdmit =
        isStructural ||
        isAcronym ||
        (isMultiWord && (isRepeatedAcrossDocs || isFrequentInDoc)) ||
        (!isMultiWord && isRepeatedAcrossDocs);

      if (shouldAdmit) {
        const termEntry: VocabularyTerm = {
          term: bonded,
          rawPhrase: acc.rawPhrase,
          displayName: acc.displayName,
          docCount: acc.docIds.size,
          totalOccurrences: acc.totalOccurrences,
          sources: Array.from(acc.sources),
          docIds: Array.from(acc.docIds),
        };

        this.terms.set(bonded, termEntry);
        if (isMultiWord) {
          this.phraseToBondedMap.set(acc.rawPhrase, bonded);
          this.bondedToPhraseMap.set(bonded, acc.rawPhrase);
        }
      }
    }

    this.recompilePhraseRegex();
    return this;
  }

  private extractCandidatesFromDocument(doc: AdrDocument): Array<{ phrase: string; source: TermSource }> {
    const candidates: Array<{ phrase: string; source: TermSource }> = [];
    const content = doc.rawContent;

    // 1. Structural Cue: Backticked code spans (1 to 4 words)
    const backtickRegex = /`([^`\n\r]+)`/g;
    let bMatch: RegExpExecArray | null;
    while ((bMatch = backtickRegex.exec(content)) !== null) {
      const text = bMatch[1].trim();
      if (text.length >= 2 && text.length <= 45 && !text.includes('\n')) {
        candidates.push({ phrase: text, source: 'code_span' });
      }
    }

    // 2. Structural Cue: Headers (H1, H2, H3)
    const headerRegex = /^#{1,3}\s+(.+)$/gm;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = headerRegex.exec(content)) !== null) {
      const headerTitle = hMatch[1]
        .replace(/^ADR[-:\s]*[0-9]{1,4}[:\s-]*/i, '')
        .replace(/[:|()]/g, ' ')
        .trim();
      if (headerTitle) {
        candidates.push({ phrase: headerTitle, source: 'header' });
        // Also add constituent chunks from header
        this.extractClauseShingles(headerTitle, candidates, 'header');
      }
    }

    // 3. Structural Cue: Option titles in considered options
    const optionRegex = /(?:Option|\* Option|\+ Option|- Option)\s+[0-9]+:\s*([^\n\r]+)/gi;
    let oMatch: RegExpExecArray | null;
    while ((oMatch = optionRegex.exec(content)) !== null) {
      const optText = oMatch[1].replace(/["`]/g, '').trim();
      if (optText) {
        candidates.push({ phrase: optText, source: 'option_title' });
        this.extractClauseShingles(optText, candidates, 'option_title');
      }
    }

    // 4. Orthographic Cue: Acronyms (including mixed-case like mTLS, gRPC, eBPF)
    const acronymRegex = /\b(?:[a-z]{1,2}[A-Z]{2,}|[A-Z][A-Z0-9_-]{1,8})\b/g;
    let aMatch: RegExpExecArray | null;
    while ((aMatch = acronymRegex.exec(content)) !== null) {
      const acr = aMatch[0].trim();
      if (acr.length >= 2 && !['THE', 'AND', 'FOR', 'NOT', 'ALL', 'ANY', 'BUT', 'CAN', 'NEW', 'ADR'].includes(acr)) {
        candidates.push({ phrase: acr, source: 'acronym' });
      }
    }

    // 5. Orthographic Cue: Title Case multi-word phrases (2 to 4 words)
    const titleCaseRegex = /\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){1,3}\b/g;
    let tcMatch: RegExpExecArray | null;
    while ((tcMatch = titleCaseRegex.exec(content)) !== null) {
      const phrase = tcMatch[0].trim();
      candidates.push({ phrase, source: 'title_case' });
    }

    // 6. Bounded Clause Shingles (2 to 3 words strictly bounded by punctuation)
    const prose = [
      doc.metadata.title,
      doc.sections.context,
      doc.sections.decision,
      doc.sections.consideredOptions || '',
    ].join('\n');

    this.extractClauseShingles(prose, candidates, 'clause_shingle');

    return candidates;
  }

  private extractClauseShingles(
    text: string,
    candidates: Array<{ phrase: string; source: TermSource }>,
    source: TermSource
  ): void {
    // Split prose into clauses across hard punctuation and line boundaries
    const clauses = text.split(/[.!?;:\n\r|()[\]{}"]+/);

    for (const clause of clauses) {
      const trimmed = clause.trim();
      if (!trimmed) continue;

      const rawWords = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9\s-_]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      if (rawWords.length < 2) continue;

      // Group into runs of non-stopwords
      let currentRun: string[] = [];

      for (const word of rawWords) {
        if (STOP_WORDS.has(word) || GENERIC_DISALLOWED_TOKENS.has(word)) {
          if (currentRun.length >= 2) {
            this.emitShingles(currentRun, candidates, source);
          }
          currentRun = [];
        } else {
          currentRun.push(word);
        }
      }

      if (currentRun.length >= 2) {
        this.emitShingles(currentRun, candidates, source);
      }
    }
  }

  private emitShingles(
    run: string[],
    candidates: Array<{ phrase: string; source: TermSource }>,
    source: TermSource
  ): void {
    // Emit bigrams and trigrams
    for (let i = 0; i < run.length; i++) {
      if (i + 1 < run.length) {
        candidates.push({ phrase: `${run[i]} ${run[i + 1]}`, source });
      }
      if (i + 2 < run.length) {
        candidates.push({ phrase: `${run[i]} ${run[i + 1]} ${run[i + 2]}`, source });
      }
    }
  }

  private recompilePhraseRegex(): void {
    const multiWordPhrases = Array.from(this.phraseToBondedMap.keys())
      // Sort by length descending so longer phrases match before shorter sub-phrases
      .sort((a, b) => b.length - a.length);

    if (multiWordPhrases.length === 0) {
      this.compiledPhraseRegex = null;
      return;
    }

    const escaped = multiWordPhrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this.compiledPhraseRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }

  /**
   * Replaces occurrences of multi-word vocabulary phrases with bonded single tokens.
   */
  public bondPhrases(text: string): string {
    if (!this.compiledPhraseRegex) {
      return text;
    }

    return text.replace(this.compiledPhraseRegex, (match) => {
      const lower = match.toLowerCase();
      return this.phraseToBondedMap.get(lower) || match;
    });
  }
}
