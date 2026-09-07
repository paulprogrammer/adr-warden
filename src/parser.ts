import { createHash } from 'node:crypto';
import { statSync, readFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import type {
  AdrDocument,
  AdrMetadata,
  AdrSections,
  VectorChunk,
} from './types.js';

export function calculateContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function parseAdrMarkdown(
  filePath: string,
  baseDir?: string,
  contentOverride?: string
): AdrDocument {
  const content = contentOverride ?? readFileSync(filePath, 'utf8');
  let mtime = 0;
  if (!contentOverride) {
    try {
      mtime = statSync(filePath).mtimeMs;
    } catch {
      mtime = Date.now();
    }
  } else {
    mtime = Date.now();
  }

  const filename = basename(filePath);
  const relPath = baseDir ? relative(baseDir, filePath) : filePath;
  const hash = calculateContentHash(content);

  const lines = content.split(/\r?\n/);

  // Extract ID and Title
  let id = '';
  let title = '';

  // Attempt ID extraction from filename first
  const fnMatch = filename.match(/^(?:adr-)?([0-9]{3,4})/i);
  if (fnMatch) {
    id = fnMatch[1];
  }

  // Look for H1 header: # ADR-0001: Runtime Configuration...
  const h1Index = lines.findIndex((l) => l.trim().startsWith('# '));
  if (h1Index !== -1) {
    const h1Text = lines[h1Index].replace(/^#\s+/, '').trim();
    const h1IdMatch = h1Text.match(/^(?:ADR[-:]\s*([0-9A-Za-z-]+)|([0-9]{1,4})\.)(?::|\s+)-(.*)$/i)
      || h1Text.match(/^(?:ADR-)?([0-9A-Za-z_-]+):\s*(.*)$/i);

    if (h1IdMatch) {
      const extractedId = (h1IdMatch[1] || h1IdMatch[2] || '').trim();
      if (extractedId && !id) {
        id = extractedId;
      }
      title = (h1IdMatch[3] || h1IdMatch[2] || h1Text).trim();
    } else {
      title = h1Text;
    }
  }

  if (!id) {
    // Fallback: derive ID from filename without extension
    id = filename.replace(/\.md$/i, '');
  }
  if (!title) {
    title = filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
  }

  // Metadata Extraction (Support bullet points, bold key-values, and frontmatter)
  const metadata: AdrMetadata = {
    id,
    title,
    status: 'proposed',
  };

  // Scan lines until first H2 header for metadata
  const firstH2 = lines.findIndex((l) => /^##\s+/.test(l.trim()));
  const metadataLines = firstH2 !== -1 ? lines.slice(0, firstH2) : lines.slice(0, 40);

  for (const line of metadataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const rawLine = trimmed.replace(/^(?:\*|-|\+)\s+/, '');
    const colonIdx = rawLine.indexOf(':');
    if (colonIdx === -1) continue;

    const key = rawLine.slice(0, colonIdx).replace(/[*_#]/g, '').trim().toLowerCase();
    const val = rawLine.slice(colonIdx + 1).replace(/^[*_]+|[*_]+$/g, '').trim();

    if (key === 'status') {
      metadata.status = val.toLowerCase();
    } else if (key === 'date') {
      const dateMatch = val.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/);
      if (dateMatch) {
        metadata.date = dateMatch[1];
      } else {
        metadata.date = val;
      }
    } else if (key === 'deciders' || key === 'decision owners') {
      metadata.deciders = val
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (key === 'technical story' || key === 'related work items') {
      metadata.technicalStory = val;
    } else if (key === 'supersedes' || key === 'obsoletes') {
      metadata.supersedes = extractAdrReferences(val);
    } else if (key === 'superseded by' || key === 'superseded-by' || key === 'obsoleted by' || key === 'obsoleted-by') {
      metadata.supersededBy = extractAdrReferences(val);
    } else if (key === 'extends') {
      metadata.extends = extractAdrReferences(val);
    } else if (key === 'amends' || key === 'updates') {
      metadata.amends = extractAdrReferences(val);
    } else if (key === 'depends on' || key === 'depends-on' || key === 'prerequisites' || key === 'dependencies') {
      metadata.dependsOn = extractAdrReferences(val);
    } else if (key === 'required by' || key === 'required-by' || key === 'decision required before') {
      metadata.requiredBy = extractAdrReferences(val);
    } else if (key === 'category') {
      metadata.category = val;
    }
  }

  // Section Extraction (H2 Headings)
  const sections: AdrSections = {
    context: '',
    decision: '',
  };

  const sectionMap = parseSections(lines);
  sections.context =
    sectionMap['context and problem statement'] ||
    sectionMap['context'] ||
    sectionMap['problem statement'] ||
    '';
  sections.decisionDrivers =
    sectionMap['decision drivers'] || sectionMap['drivers'] || '';
  sections.consideredOptions =
    sectionMap['considered options'] ||
    sectionMap['alternatives considered'] ||
    sectionMap['options'] ||
    '';
  sections.decision =
    sectionMap['decision outcome'] ||
    sectionMap['decision'] ||
    sectionMap['decision outcome & rationale'] ||
    '';
  sections.consequences =
    sectionMap['consequences'] ||
    sectionMap['pros and cons of the options'] ||
    '';

  // Extract Mermaid diagrams
  const diagrams: string[] = [];
  const diagramRegex = /```mermaid([\s\S]*?)```/g;
  let dMatch: RegExpExecArray | null;
  while ((dMatch = diagramRegex.exec(content)) !== null) {
    diagrams.push(dMatch[1].trim());
  }
  if (diagrams.length > 0) {
    sections.diagrams = diagrams;
  }

  // Summary Text for holistic document embedding
  const summaryParts: string[] = [
    `ADR ${id}: ${title}`,
    `Status: ${metadata.status}`,
  ];
  if (metadata.category) {
    summaryParts.push(`Category: ${metadata.category}`);
  }
  if (sections.context) {
    summaryParts.push(`Context: ${truncateWords(cleanProse(sections.context), 120)}`);
  }
  if (sections.decision) {
    summaryParts.push(`Decision: ${truncateWords(cleanProse(sections.decision), 120)}`);
  }
  const summaryText = summaryParts.join('\n');

  const inlineReferences = extractInlineCitations(content, id);
  const entities = extractTechnicalEntities(content);

  return {
    id,
    filePath,
    relativePath: relPath,
    contentHash: hash,
    mtime,
    metadata,
    sections,
    rawContent: content,
    summaryText,
    inlineReferences,
    entities,
  };
}

export function extractTechnicalEntities(content: string): string[] {
  const entities = new Set<string>();

  // 1. Backticked code tokens (e.g. `gRPC`, `OpenTelemetry`, `sha256`)
  const backtickRegex = /`([^`\n\r]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(content)) !== null) {
    const candidate = match[1].trim();
    if (candidate.length >= 2 && candidate.length <= 40 && !candidate.includes(' ')) {
      entities.add(candidate.toLowerCase());
    }
  }

  // 2. Acronyms & technical abbreviations in all-caps (e.g. GKE, RBAC, OIDC, CAF, REST, SQL, IAM, CI/CD, JSON, JWT, API)
  const acronymRegex = /\b[A-Z][A-Z0-9_-]{1,10}\b/g;
  while ((match = acronymRegex.exec(content)) !== null) {
    const candidate = match[0].trim();
    if (candidate.length >= 2 && !['THE', 'AND', 'FOR', 'NOT', 'ALL', 'ANY', 'BUT', 'CAN', 'NEW', 'ADR'].includes(candidate)) {
      entities.add(candidate.toLowerCase());
    }
  }

  // 3. Known architectural technologies and platforms
  const knownTechRegex = /\b(kubernetes|k8s|consul|vault|postgres|postgresql|mysql|redis|kafka|rabbitmq|istio|envoy|helm|docker|podman|terraform|argocd|argo|prometheus|grafana|opentelemetry|otel|grpc|graphql|azure|aws|gcp|google\s+cloud|azure\s+devops)\b/gi;
  while ((match = knownTechRegex.exec(content)) !== null) {
    entities.add(match[0].trim().toLowerCase().replace(/\s+/g, '-'));
  }

  // 4. ADR identifiers (e.g. ADR-0001, ADR-002)
  const adrRefRegex = /ADR[-:\s]*([0-9]{1,4})/gi;
  while ((match = adrRefRegex.exec(content)) !== null) {
    entities.add(`adr-${match[1].padStart(4, '0')}`);
  }

  return Array.from(entities);
}

export function extractInlineCitations(content: string, selfId: string): string[] {
  const citations = new Set<string>();
  const pattern = /(?:legacy\s+adr[-:\s]*([0-9]{1,4})|adr[-:\s]*([0-9]{3,4})|(?:docs\/adr|legacy_adr)\/(?:adr-)?([0-9]{3,4}))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const rawId = (match[1] || match[2] || match[3] || '').trim();
    if (rawId && rawId !== selfId && !citations.has(rawId)) {
      citations.add(rawId);
    }
  }
  return Array.from(citations);
}

export function cleanProse(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[|:-]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createChunks(doc: AdrDocument): VectorChunk[] {
  const chunks: VectorChunk[] = [];

  // 1. Summary chunk (always included)
  chunks.push({
    chunkId: `${doc.id}#summary`,
    docId: doc.id,
    sectionType: 'summary',
    text: doc.summaryText,
  });

  // 2. Context chunk (if available)
  const cleanedContext = cleanProse(doc.sections.context);
  if (cleanedContext) {
    chunks.push({
      chunkId: `${doc.id}#context`,
      docId: doc.id,
      sectionType: 'context',
      text: `ADR ${doc.id} Context: ${truncateWords(cleanedContext, 250)}`,
    });
  }

  // 3. Decision chunk (if available)
  const cleanedDecision = cleanProse(doc.sections.decision);
  if (cleanedDecision) {
    chunks.push({
      chunkId: `${doc.id}#decision`,
      docId: doc.id,
      sectionType: 'decision',
      text: `ADR ${doc.id} Decision: ${truncateWords(cleanedDecision, 250)}`,
    });
  }

  // 4. Considered Options chunk (if available)
  if (doc.sections.consideredOptions && doc.sections.consideredOptions.trim()) {
    const cleanedOptions = cleanProse(doc.sections.consideredOptions);
    if (cleanedOptions) {
      chunks.push({
        chunkId: `${doc.id}#options`,
        docId: doc.id,
        sectionType: 'options',
        text: `ADR ${doc.id} Options: ${truncateWords(cleanedOptions, 200)}`,
      });
    }
  }

  return chunks;
}

function parseSections(lines: string[]): Record<string, string> {
  const sections: Record<string, string> = {};
  let currentHeader = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      if (currentHeader) {
        sections[currentHeader.toLowerCase()] = currentLines.join('\n').trim();
      }
      currentHeader = h2Match[1].trim();
      currentLines = [];
    } else if (currentHeader) {
      currentLines.push(line);
    }
  }

  if (currentHeader) {
    sections[currentHeader.toLowerCase()] = currentLines.join('\n').trim();
  }

  return sections;
}

function extractAdrReferences(raw: string): string[] {
  const matches: string[] = [];
  const refRegex = /(?:ADR-)?([0-9]{3,4})/gi;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(raw)) !== null) {
    matches.push(match[1]);
  }
  return matches.length > 0
    ? [...new Set(matches)]
    : raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return words.slice(0, maxWords).join(' ') + '...';
}
