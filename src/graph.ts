import type {
  AdrDocument,
  AdrEdge,
  AdrNode,
  AdrStatus,
  GraphValidationReport,
  ImpactReport,
  LineageReport,
  LineageStep,
  RelationType,
  ValidationCode,
  ValidationIssue,
} from './types.js';

const INVERSE_RELATIONS: Record<RelationType, RelationType> = {
  OBSOLETES: 'OBSOLETED_BY',
  OBSOLETED_BY: 'OBSOLETES',
  EXTENDS: 'EXTENDED_BY',
  EXTENDED_BY: 'EXTENDS',
  AMENDS: 'AMENDED_BY',
  AMENDED_BY: 'AMENDS',
  DEPENDS_ON: 'REQUIRED_BY',
  REQUIRED_BY: 'DEPENDS_ON',
  REFERENCES: 'REFERENCED_BY',
  REFERENCED_BY: 'REFERENCES',
};

export class AdrKnowledgeGraph {
  private nodes: Map<string, AdrNode> = new Map();
  private outgoing: Map<string, AdrEdge[]> = new Map();
  private incoming: Map<string, AdrEdge[]> = new Map();
  // Map of alternate normalized identifiers to canonical ID
  private aliasMap: Map<string, string> = new Map();

  constructor() {}

  public getNodeCount(): number {
    return this.nodes.size;
  }

  public getEdgeCount(): number {
    let count = 0;
    for (const edges of this.outgoing.values()) {
      count += edges.length;
    }
    // Every directional relationship is stored once in outgoing as source->target
    return count;
  }

  public addNode(node: AdrNode): void {
    this.nodes.set(node.id, node);
    this.registerAliases(node.id);
  }

  public getNode(id: string): AdrNode | undefined {
    const canonicalId = this.resolveId(id);
    return canonicalId ? this.nodes.get(canonicalId) : undefined;
  }

  public getAllNodes(): AdrNode[] {
    return Array.from(this.nodes.values());
  }

  public addEdge(
    sourceId: string,
    targetId: string,
    type: RelationType,
    explicit: boolean = true,
    description?: string
  ): void {
    const canonicalSource = this.resolveId(sourceId) || sourceId;
    const canonicalTarget = this.resolveId(targetId) || targetId;

    if (!this.outgoing.has(canonicalSource)) {
      this.outgoing.set(canonicalSource, []);
    }
    if (!this.incoming.has(canonicalTarget)) {
      this.incoming.set(canonicalTarget, []);
    }

    const existingOut = this.outgoing.get(canonicalSource)!;
    if (!existingOut.some((e) => e.target === canonicalTarget && e.type === type)) {
      existingOut.push({
        source: canonicalSource,
        target: canonicalTarget,
        type,
        explicit,
        description,
      });
    }

    const invType = INVERSE_RELATIONS[type];
    const existingIn = this.incoming.get(canonicalTarget)!;
    if (!existingIn.some((e) => e.target === canonicalSource && e.type === invType)) {
      existingIn.push({
        source: canonicalTarget,
        target: canonicalSource,
        type: invType,
        explicit,
        description,
      });
    }
  }

  public getOutgoingEdges(id: string, type?: RelationType): AdrEdge[] {
    const canonicalId = this.resolveId(id);
    if (!canonicalId) return [];
    const list = this.outgoing.get(canonicalId) || [];
    return type ? list.filter((e) => e.type === type) : list;
  }

  public getIncomingEdges(id: string, type?: RelationType): AdrEdge[] {
    const canonicalId = this.resolveId(id);
    if (!canonicalId) return [];
    const list = this.incoming.get(canonicalId) || [];
    return type ? list.filter((e) => e.type === type) : list;
  }

  public buildFromDocuments(documents: AdrDocument[]): void {
    this.nodes.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.aliasMap.clear();

    // First pass: Register all target catalog nodes (skip legacy documents)
    for (const doc of documents) {
      if (doc.filePath.includes('legacy')) {
        continue;
      }
      const node: AdrNode = {
        id: doc.id,
        title: doc.metadata.title,
        status: doc.metadata.status,
        date: doc.metadata.date,
        category: doc.metadata.category,
        filePath: doc.filePath,
        catalog: 'target',
      };
      this.addNode(node);
    }

    // Second pass: Register explicit metadata relations and inline references
    for (const doc of documents) {
      if (doc.filePath.includes('legacy')) {
        continue;
      }
      const sourceId = doc.id;

      // 1. Supersedes / Obsoletes
      if (doc.metadata.supersedes) {
        for (const targetId of doc.metadata.supersedes) {
          this.addEdge(sourceId, targetId, 'OBSOLETES', true, 'Explicit metadata supersession');
        }
      }

      // 2. SupersededBy / ObsoletedBy
      if (doc.metadata.supersededBy) {
        for (const targetId of doc.metadata.supersededBy) {
          this.addEdge(targetId, sourceId, 'OBSOLETES', true, 'Explicit metadata reverse supersession');
        }
      }

      // 3. Extends
      if (doc.metadata.extends) {
        for (const targetId of doc.metadata.extends) {
          this.addEdge(sourceId, targetId, 'EXTENDS', true, 'Explicit architectural extension');
        }
      }

      // 4. Amends / Updates
      if (doc.metadata.amends) {
        for (const targetId of doc.metadata.amends) {
          this.addEdge(sourceId, targetId, 'AMENDS', true, 'Explicit architectural amendment');
        }
      }

      // 5. DependsOn / Prerequisites
      if (doc.metadata.dependsOn) {
        for (const targetId of doc.metadata.dependsOn) {
          this.addEdge(sourceId, targetId, 'DEPENDS_ON', true, 'Explicit operational prerequisite');
        }
      }

      // 6. RequiredBy
      if (doc.metadata.requiredBy) {
        for (const targetId of doc.metadata.requiredBy) {
          this.addEdge(targetId, sourceId, 'DEPENDS_ON', true, 'Explicit reverse dependency requirement');
        }
      }

      // 7. Inline references from content
      if (doc.inlineReferences) {
        for (const refId of doc.inlineReferences) {
          const resolvedTarget = this.resolveId(refId);
          if (resolvedTarget && resolvedTarget !== sourceId) {
            // Only add citation if no stronger relation already exists
            const existing = this.getOutgoingEdges(sourceId).find((e) => e.target === resolvedTarget);
            if (!existing) {
              this.addEdge(sourceId, resolvedTarget, 'REFERENCES', false, 'Extracted inline citation');
            }
          }
        }
      }
    }
  }

  // RFC-style Lineage Traversal
  public getLineage(id: string): LineageReport {
    const canonicalId = this.resolveId(id);
    if (!canonicalId || !this.nodes.has(canonicalId)) {
      throw new Error(`Cannot traverse lineage: ADR "${id}" not found in knowledge graph.`);
    }

    const node = this.nodes.get(canonicalId)!;
    const timeline: LineageStep[] = [];
    const visitedSuccessors = new Set<string>();
    const successors: string[] = [];

    // Follow obsoletion and amendment chains forward
    let currentId = canonicalId;
    while (true) {
      visitedSuccessors.add(currentId);
      const incomingInv = this.incoming.get(currentId) || [];
      const obsEdge = incomingInv.find((e) => e.type === 'OBSOLETED_BY');
      const amendEdge = incomingInv.find((e) => e.type === 'AMENDED_BY');
      const forwardEdge = obsEdge || amendEdge;

      if (!forwardEdge || visitedSuccessors.has(forwardEdge.target)) {
        break;
      }

      const nextNode = this.nodes.get(forwardEdge.target);
      timeline.push({
        fromId: currentId,
        toId: forwardEdge.target,
        relation: forwardEdge.type,
        date: nextNode?.date,
      });

      successors.push(forwardEdge.target);
      currentId = forwardEdge.target;
    }

    // Follow obsoletion chain backward to roots
    const ancestors: string[] = [];
    const visitedAncestors = new Set<string>([canonicalId]);
    const queue = [canonicalId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const edges = this.outgoing.get(curr) || [];
      for (const edge of edges) {
        if (edge.type === 'OBSOLETES' && !visitedAncestors.has(edge.target)) {
          visitedAncestors.add(edge.target);
          ancestors.push(edge.target);
          queue.push(edge.target);
        }
      }
    }

    const activeStandardId = currentId;
    const isActive = activeStandardId === canonicalId;

    let summary = '';
    if (isActive) {
      summary = `ADR-${canonicalId} is the current active standard.`;
      if (ancestors.length > 0) {
        summary += ` It obsoletes prior art: ADR-${ancestors.join(', ADR-')}.`;
      }
    } else {
      summary = `ADR-${canonicalId} has been superseded in lineage. Active replacement is ADR-${activeStandardId}.`;
    }

    return {
      targetId: canonicalId,
      activeStandardId,
      isActive,
      ancestors,
      successors,
      timeline,
      summary,
    };
  }

  // Downstream Impact / Blast Radius Analysis
  public getImpact(id: string): ImpactReport {
    const canonicalId = this.resolveId(id);
    if (!canonicalId || !this.nodes.has(canonicalId)) {
      throw new Error(`Cannot analyze impact: ADR "${id}" not found in knowledge graph.`);
    }

    const node = this.nodes.get(canonicalId)!;
    const directDependents: Array<{ id: string; title: string; relation: RelationType }> = [];
    const extensions: Array<{ id: string; title: string; relation: RelationType }> = [];
    const citations: Array<{ id: string; title: string }> = [];

    const inEdges = this.incoming.get(canonicalId) || [];
    for (const edge of inEdges) {
      const depNode = this.nodes.get(edge.target);
      const title = depNode?.title || edge.target;

      if (edge.type === 'REQUIRED_BY') {
        // edge.target DEPENDS_ON canonicalId
        directDependents.push({ id: edge.target, title, relation: 'DEPENDS_ON' });
      } else if (edge.type === 'EXTENDED_BY') {
        extensions.push({ id: edge.target, title, relation: 'EXTENDS' });
      } else if (edge.type === 'AMENDED_BY') {
        extensions.push({ id: edge.target, title, relation: 'AMENDS' });
      } else if (edge.type === 'REFERENCED_BY') {
        citations.push({ id: edge.target, title });
      }
    }

    // Transitive Dependents BFS
    const transitiveDependents: Array<{ id: string; title: string; depth: number }> = [];
    const visited = new Set<string>([canonicalId]);
    const queue: Array<{ id: string; depth: number }> = [];

    for (const d of directDependents) {
      visited.add(d.id);
      queue.push({ id: d.id, depth: 1 });
    }
    for (const ext of extensions) {
      if (!visited.has(ext.id)) {
        visited.add(ext.id);
        queue.push({ id: ext.id, depth: 1 });
      }
    }

    while (queue.length > 0) {
      const { id: currId, depth } = queue.shift()!;
      const currInEdges = this.incoming.get(currId) || [];
      for (const edge of currInEdges) {
        if (
          (edge.type === 'REQUIRED_BY' || edge.type === 'EXTENDED_BY' || edge.type === 'AMENDED_BY') &&
          !visited.has(edge.target)
        ) {
          visited.add(edge.target);
          const tNode = this.nodes.get(edge.target);
          transitiveDependents.push({
            id: edge.target,
            title: tNode?.title || edge.target,
            depth: depth + 1,
          });
          queue.push({ id: edge.target, depth: depth + 1 });
        }
      }
    }

    const advisory: string[] = [];
    if (directDependents.length > 0) {
      advisory.push(
        `${directDependents.length} downstream ADRs depend directly on this decision.`
      );
    }
    if (extensions.length > 0) {
      advisory.push(
        `${extensions.length} ADRs specialize or extend this baseline architecture.`
      );
    }
    if (transitiveDependents.length > 0) {
      advisory.push(
        `${transitiveDependents.length} transitive downstream records will be impacted by changes to this decision.`
      );
    }
    if (advisory.length === 0) {
      advisory.push('Zero active downstream dependents detected. Blast radius is isolated.');
    }

    const blastRadiusScore =
      directDependents.length * 3 + extensions.length * 2 + transitiveDependents.length * 1.5;

    return {
      targetId: canonicalId,
      targetTitle: node.title,
      directDependents,
      transitiveDependents,
      extensions,
      citations,
      blastRadiusScore,
      advisory,
    };
  }

  // Upstream Dependencies (Topological Precedence)
  public getDependencies(id: string): {
    targetId: string;
    dependencies: Array<{ id: string; title: string; status: AdrStatus; relation: RelationType; depth: number }>;
    hasDeprecatedPrerequisite: boolean;
  } {
    const canonicalId = this.resolveId(id);
    if (!canonicalId || !this.nodes.has(canonicalId)) {
      throw new Error(`Cannot retrieve dependencies: ADR "${id}" not found in knowledge graph.`);
    }

    const results: Array<{ id: string; title: string; status: AdrStatus; relation: RelationType; depth: number }> = [];
    const visited = new Set<string>([canonicalId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: canonicalId, depth: 0 }];
    let hasDeprecatedPrerequisite = false;

    while (queue.length > 0) {
      const { id: currId, depth } = queue.shift()!;
      const outEdges = this.outgoing.get(currId) || [];

      for (const edge of outEdges) {
        if (
          (edge.type === 'DEPENDS_ON' || edge.type === 'EXTENDS' || edge.type === 'AMENDS') &&
          !visited.has(edge.target)
        ) {
          visited.add(edge.target);
          const tNode = this.nodes.get(edge.target);
          const status = tNode?.status || 'unknown';
          if (status === 'deprecated' || status === 'superseded') {
            hasDeprecatedPrerequisite = true;
          }
          results.push({
            id: edge.target,
            title: tNode?.title || edge.target,
            status,
            relation: edge.type,
            depth: depth + 1,
          });
          queue.push({ id: edge.target, depth: depth + 1 });
        }
      }
    }

    return {
      targetId: canonicalId,
      dependencies: results,
      hasDeprecatedPrerequisite,
    };
  }

  // Graph Validation
  public validate(): GraphValidationReport {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // 1. Dangling Reference Detection
    for (const [sourceId, edges] of this.outgoing.entries()) {
      for (const edge of edges) {
        if (edge.explicit && !this.nodes.has(edge.target)) {
          errors.push({
            severity: 'error',
            code: 'DANGLING_REFERENCE',
            message: `ADR-${sourceId} declares ${edge.type} reference to non-existent ADR "${edge.target}".`,
            nodeIds: [sourceId, edge.target],
            remediation: `Verify and update the reference in ADR-${sourceId} or create missing record ADR-${edge.target}.`,
          });
        }
      }
    }

    // 2. Cycle Detection in OBSOLETES and DEPENDS_ON
    this.detectCycles('OBSOLETES', errors);
    this.detectCycles('DEPENDS_ON', errors);

    // 3. Status Contradictions
    for (const [id, node] of this.nodes.entries()) {
      const outEdges = this.outgoing.get(id) || [];
      const inEdges = this.incoming.get(id) || [];

      // Check if an accepted ADR extends a superseded or deprecated ADR
      if (node.status === 'accepted') {
        for (const edge of outEdges) {
          if (edge.type === 'EXTENDS' || edge.type === 'DEPENDS_ON') {
            const targetNode = this.nodes.get(edge.target);
            if (targetNode && (targetNode.status === 'superseded' || targetNode.status === 'deprecated')) {
              warnings.push({
                severity: 'warning',
                code: 'STATUS_CONTRADICTION',
                message: `Active ADR-${id} (${node.status}) extends ${targetNode.status} ADR-${edge.target}.`,
                nodeIds: [id, edge.target],
                remediation: `Re-target ADR-${id} to extend the active successor of ADR-${edge.target}.`,
              });
            }
          }
        }
      }

      // Check if an ADR is marked accepted, but an outgoing OBSOLETED_BY indicates another accepted ADR supersedes it
      for (const edge of inEdges) {
        if (edge.type === 'OBSOLETED_BY') {
          const replacingNode = this.nodes.get(edge.target);
          if (replacingNode && replacingNode.status === 'accepted' && node.status === 'accepted') {
            errors.push({
              severity: 'error',
              code: 'STATUS_CONTRADICTION',
              message: `Split-brain status: ADR-${id} is marked "accepted", but is superseded by accepted ADR-${edge.target}.`,
              nodeIds: [id, edge.target],
              remediation: `Update the status of ADR-${id} from "accepted" to "superseded".`,
            });
          }
        }
      }
    }

    // 4. Orphan Nodes (Nodes with zero connections in target catalog)
    for (const [id, node] of this.nodes.entries()) {
      if (node.catalog === 'target') {
        const outEdges = this.outgoing.get(id) || [];
        const inEdges = this.incoming.get(id) || [];
        if (outEdges.length === 0 && inEdges.length === 0) {
          warnings.push({
            severity: 'warning',
            code: 'ORPHAN_RECORD',
            message: `ADR-${id} ('${node.title}') has zero architectural links or citations.`,
            nodeIds: [id],
            remediation: `Review whether ADR-${id} should extend a foundational record or be referenced by related work items.`,
          });
        }
      }
    }

    const valid = errors.length === 0;
    const summary = valid
      ? `Knowledge graph valid: ${this.nodes.size} nodes, ${this.getEdgeCount()} edges, zero fatal errors, ${warnings.length} warnings.`
      : `Knowledge graph invalid: ${errors.length} fatal errors detected, ${warnings.length} warnings.`;

    return {
      valid,
      totalNodes: this.nodes.size,
      totalEdges: this.getEdgeCount(),
      errors,
      warnings,
      summary,
    };
  }

  // Mermaid Diagram Export
  public toMermaid(options: { focusId?: string; radius?: number } = {}): string {
    const lines: string[] = ['flowchart TD'];

    // Class styles
    lines.push('    classDef target fill:#E8F8F5,stroke:#008080,stroke-width:2px,color:#0E6251;');
    lines.push('    classDef legacy fill:#F0F4F8,stroke:#00205B,stroke-width:2px,color:#00205B;');
    lines.push('    classDef focus fill:#FEF9E7,stroke:#B7791F,stroke-width:3px,color:#7D6608;');

    let targetNodes = Array.from(this.nodes.values());

    if (options.focusId) {
      const canonicalFocus = this.resolveId(options.focusId);
      if (canonicalFocus) {
        const radius = options.radius ?? 1;
        const visibleIds = new Set<string>([canonicalFocus]);

        let currentWave = [canonicalFocus];
        for (let r = 0; r < radius; r++) {
          const nextWave: string[] = [];
          for (const curr of currentWave) {
            const outEdges = this.outgoing.get(curr) || [];
            const inEdges = this.incoming.get(curr) || [];
            for (const e of outEdges) {
              if (!visibleIds.has(e.target)) {
                visibleIds.add(e.target);
                nextWave.push(e.target);
              }
            }
            for (const e of inEdges) {
              if (!visibleIds.has(e.target)) {
                visibleIds.add(e.target);
                nextWave.push(e.target);
              }
            }
          }
          currentWave = nextWave;
        }

        targetNodes = targetNodes.filter((n) => visibleIds.has(n.id));
      }
    }

    // Render nodes
    for (const node of targetNodes) {
      const styleClass =
        options.focusId && this.resolveId(options.focusId) === node.id
          ? 'focus'
          : node.catalog === 'legacy'
          ? 'legacy'
          : 'target';

      // Clean label: no list formatting, clean line breaks
      const safeTitle = node.title.replace(/["[\]()]/g, '').slice(0, 35);
      lines.push(`    N_${sanitizeNodeId(node.id)}["ADR-${node.id}<br/>${safeTitle}<br/>(${node.status})"]:::${styleClass}`);
    }

    // Render edges
    const renderedEdges = new Set<string>();
    for (const node of targetNodes) {
      const edges = this.outgoing.get(node.id) || [];
      for (const edge of edges) {
        if (!targetNodes.some((n) => n.id === edge.target)) continue;

        const edgeKey = `${edge.source}->${edge.target}:${edge.type}`;
        if (renderedEdges.has(edgeKey)) continue;
        renderedEdges.add(edgeKey);

        const srcNode = `N_${sanitizeNodeId(edge.source)}`;
        const tgtNode = `N_${sanitizeNodeId(edge.target)}`;

        if (edge.type === 'OBSOLETES') {
          lines.push(`    ${srcNode} -->|obsoletes| ${tgtNode}`);
        } else if (edge.type === 'EXTENDS') {
          lines.push(`    ${srcNode} -.->|extends| ${tgtNode}`);
        } else if (edge.type === 'AMENDS') {
          lines.push(`    ${srcNode} -.->|amends| ${tgtNode}`);
        } else if (edge.type === 'DEPENDS_ON') {
          lines.push(`    ${srcNode} ==>|requires| ${tgtNode}`);
        } else if (edge.type === 'REFERENCES') {
          lines.push(`    ${srcNode} -.->|cites| ${tgtNode}`);
        }
      }
    }

    return lines.join('\n');
  }

  private detectCycles(relationType: RelationType, errors: ValidationIssue[]): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const parentMap = new Map<string, string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const edges = this.outgoing.get(nodeId) || [];
      for (const edge of edges) {
        if (edge.type !== relationType) continue;

        if (!visited.has(edge.target)) {
          parentMap.set(edge.target, nodeId);
          if (dfs(edge.target)) return true;
        } else if (recStack.has(edge.target)) {
          // Cycle found! Reconstruct cycle path
          const cycle: string[] = [edge.target, nodeId];
          let p = parentMap.get(nodeId);
          while (p && p !== edge.target) {
            cycle.push(p);
            p = parentMap.get(p);
          }
          cycle.reverse();

          errors.push({
            severity: 'error',
            code: 'CYCLE_DETECTED',
            message: `Illegal cyclic ${relationType} dependency detected: ${cycle.join(' -> ')} -> ${edge.target}.`,
            nodeIds: cycle,
            remediation: `Break cyclical ${relationType} chain between records [${cycle.join(', ')}].`,
          });
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }
  }

  private registerAliases(id: string): void {
    const raw = id.trim();
    this.aliasMap.set(raw.toLowerCase(), raw);
    this.aliasMap.set(`adr-${raw}`.toLowerCase(), raw);

    // Strip leading zeros for numeric alias
    const numMatch = raw.match(/^[0-9]+/);
    if (numMatch) {
      const stripped = String(parseInt(numMatch[0], 10));
      this.aliasMap.set(stripped, raw);
      this.aliasMap.set(`adr-${stripped}`.toLowerCase(), raw);
    }
  }

  public resolveId(raw: string): string | undefined {
    const clean = raw.trim().toLowerCase();
    if (this.nodes.has(clean)) return clean;
    if (this.nodes.has(raw)) return raw;
    if (this.aliasMap.has(clean)) return this.aliasMap.get(clean);

    // Try finding by suffix or partial match
    for (const [alias, canonical] of this.aliasMap.entries()) {
      if (alias.endsWith(clean) || clean.endsWith(alias)) {
        return canonical;
      }
    }
    return undefined;
  }
}

function edgeTarget(edge: AdrEdge): string {
  return edge.target;
}

function sanitizeNodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_');
}
