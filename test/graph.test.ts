import { describe, it, expect, beforeEach } from 'vitest';
import { AdrKnowledgeGraph } from '../src/graph.js';
import type { AdrNode } from '../src/types.js';

describe('AdrKnowledgeGraph Core and Decision Lineage Traversals', () => {
  let graph: AdrKnowledgeGraph;

  beforeEach(() => {
    graph = new AdrKnowledgeGraph();
  });

  it('maintains symmetric inverse edges automatically', () => {
    const nodeA: AdrNode = {
      id: '0001',
      title: 'Base Architecture',
      status: 'accepted',
      filePath: '/docs/adr/0001.md',
      catalog: 'target',
    };
    const nodeB: AdrNode = {
      id: '0002',
      title: 'Specialized Extension',
      status: 'accepted',
      filePath: '/docs/adr/0002.md',
      catalog: 'target',
    };

    graph.addNode(nodeA);
    graph.addNode(nodeB);

    // 0002 EXTENDS 0001
    graph.addEdge('0002', '0001', 'EXTENDS');

    const outB = graph.getOutgoingEdges('0002');
    expect(outB.length).toBe(1);
    expect(outB[0].target).toBe('0001');
    expect(outB[0].type).toBe('EXTENDS');

    // Inverse should be automatically populated on 0001
    const inA = graph.getIncomingEdges('0001');
    expect(inA.length).toBe(1);
    expect(inA[0].target).toBe('0002');
    expect(inA[0].type).toBe('EXTENDED_BY');
  });

  it('traces multi-step obsoletion lineage to active replacement', () => {
    // ADR-0001 -> ADR-0002 -> ADR-0003
    graph.addNode({
      id: '0001',
      title: 'Initial Runtime Config',
      status: 'superseded',
      filePath: '/docs/adr/0001.md',
      catalog: 'target',
    });
    graph.addNode({
      id: '0002',
      title: 'Intermediate Config Standard',
      status: 'superseded',
      filePath: '/docs/adr/0002.md',
      catalog: 'target',
    });
    graph.addNode({
      id: '0003',
      title: 'Target Config Strategy',
      status: 'accepted',
      filePath: '/docs/adr/0003.md',
      catalog: 'target',
    });

    graph.addEdge('0002', '0001', 'OBSOLETES');
    graph.addEdge('0003', '0002', 'OBSOLETES');

    // Query lineage for initial record
    const lineage0001 = graph.getLineage('0001');
    expect(lineage0001.isActive).toBe(false);
    expect(lineage0001.activeStandardId).toBe('0003');
    expect(lineage0001.successors).toEqual(['0002', '0003']);
    expect(lineage0001.timeline.length).toBe(2);

    // Query lineage for latest active record
    const lineage0003 = graph.getLineage('0003');
    expect(lineage0003.isActive).toBe(true);
    expect(lineage0003.activeStandardId).toBe('0003');
    expect(lineage0003.ancestors).toContain('0002');
    expect(lineage0003.ancestors).toContain('0001');
  });

  it('calculates downstream impact and transitive blast radius', () => {
    graph.addNode({ id: '0001', title: 'Platform Core', status: 'accepted', filePath: '/a.md', catalog: 'target' });
    graph.addNode({ id: '0002', title: 'Auth Subsystem', status: 'accepted', filePath: '/b.md', catalog: 'target' });
    graph.addNode({ id: '0003', title: 'API Gateway', status: 'accepted', filePath: '/c.md', catalog: 'target' });
    graph.addNode({ id: '0004', title: 'Billing Integration', status: 'accepted', filePath: '/d.md', catalog: 'target' });

    // 0002 depends on 0001
    graph.addEdge('0002', '0001', 'DEPENDS_ON');
    // 0003 extends 0002
    graph.addEdge('0003', '0002', 'EXTENDS');
    // 0004 depends on 0003
    graph.addEdge('0004', '0003', 'DEPENDS_ON');

    const impact0001 = graph.getImpact('0001');
    expect(impact0001.directDependents.some((d) => d.id === '0002')).toBe(true);
    expect(impact0001.transitiveDependents.some((t) => t.id === '0003' && t.depth === 2)).toBe(true);
    expect(impact0001.transitiveDependents.some((t) => t.id === '0004' && t.depth === 3)).toBe(true);
    expect(impact0001.blastRadiusScore).toBeGreaterThan(0);
  });

  it('detects dangling references in validation', () => {
    graph.addNode({ id: '0001', title: 'Container Base', status: 'accepted', filePath: '/a.md', catalog: 'target' });
    // Refers to non-existent node 9999
    graph.addEdge('0001', '9999', 'EXTENDS');

    const report = graph.validate();
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'DANGLING_REFERENCE')).toBe(true);
    expect(report.errors[0].message).toContain('9999');
  });

  it('detects cyclic dependencies in validation', () => {
    graph.addNode({ id: '0001', title: 'Component A', status: 'accepted', filePath: '/a.md', catalog: 'target' });
    graph.addNode({ id: '0002', title: 'Component B', status: 'accepted', filePath: '/b.md', catalog: 'target' });
    graph.addNode({ id: '0003', title: 'Component C', status: 'accepted', filePath: '/c.md', catalog: 'target' });

    // Cyclic DEPENDS_ON: A -> B -> C -> A
    graph.addEdge('0001', '0002', 'DEPENDS_ON');
    graph.addEdge('0002', '0003', 'DEPENDS_ON');
    graph.addEdge('0003', '0001', 'DEPENDS_ON');

    const report = graph.validate();
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('detects split-brain status contradictions', () => {
    // Both 0001 and 0002 are accepted, but 0002 obsoletes 0001 without 0001 status updated
    graph.addNode({ id: '0001', title: 'Old Contract', status: 'accepted', filePath: '/a.md', catalog: 'target' });
    graph.addNode({ id: '0002', title: 'New Contract', status: 'accepted', filePath: '/b.md', catalog: 'target' });

    graph.addEdge('0002', '0001', 'OBSOLETES');

    const report = graph.validate();
    expect(report.valid).toBe(false);
    const splitBrain = report.errors.find((e) => e.code === 'STATUS_CONTRADICTION');
    expect(splitBrain).toBeDefined();
    expect(splitBrain?.message).toContain('Split-brain status');
  });

  it('generates valid Mermaid diagram adhering to ADO renderer constraints', () => {
    graph.addNode({ id: '0001', title: 'Runtime Config', status: 'accepted', filePath: '/a.md', catalog: 'target' });
    graph.addNode({ id: '0002', title: 'Digest Promotion', status: 'accepted', filePath: '/b.md', catalog: 'target' });
    graph.addEdge('0002', '0001', 'DEPENDS_ON');

    const mermaid = graph.toMermaid();
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('N_0001');
    expect(mermaid).toContain('N_0002');
    expect(mermaid).toContain('==>|requires|');
    // Verify no forbidden list syntax inside labels
    expect(mermaid).not.toContain('<br/>- ');
    expect(mermaid).not.toContain('<br/>* ');
  });
});
