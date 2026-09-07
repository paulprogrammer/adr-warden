import { describe, it, expect } from 'vitest';
import { VocabularyHarvester, cleanPhrase, toBondedToken } from '../src/vocabulary.js';
import type { AdrDocument } from '../src/types.js';

describe('VocabularyHarvester In-Situ Extraction and Shingling', () => {
  const mockDoc1: AdrDocument = {
    id: '0001',
    filePath: '/mock/0001.md',
    relativePath: '0001.md',
    contentHash: 'hash1',
    mtime: 1000,
    metadata: { id: '0001', title: 'Runtime Configuration Management', status: 'accepted' },
    sections: {
      context: 'Application configuration requires a managed parameter store and `Google Secret Manager` to avoid drift.',
      decision: 'We adopt a hybrid layered model using `Google Secret Manager` on GKE.',
      consideredOptions: 'Option 1: Self-Hosted HashiCorp Consul\nOption 2: Managed Parameter Store',
    },
    rawContent: `# ADR-0001: Runtime Configuration Management
## Context
Application configuration requires a managed parameter store and \`Google Secret Manager\` to avoid drift.
## Decision
We adopt a hybrid layered model using \`Google Secret Manager\` on GKE.
## Considered Options
Option 1: Self-Hosted HashiCorp Consul
Option 2: Managed Parameter Store
`,
    summaryText: 'Runtime Configuration Management',
  };

  const mockDoc2: AdrDocument = {
    id: '0018',
    filePath: '/mock/0018.md',
    relativePath: '0018.md',
    contentHash: 'hash18',
    mtime: 1000,
    metadata: { id: '0018', title: 'Ingress Gateway Service Mesh', status: 'accepted' },
    sections: {
      context: 'Deploying a service mesh on GKE clusters to manage mTLS traffic and canary rollout routing.',
      decision: 'Adopt Istio service mesh for ingress control.',
      consideredOptions: 'Option 1: Linkerd\nOption 2: Istio Service Mesh',
    },
    rawContent: `# ADR-0018: Ingress Gateway Service Mesh
## Context
Deploying a service mesh on GKE clusters to manage mTLS traffic and canary rollout routing.
## Decision
Adopt Istio service mesh for ingress control.
## Considered Options
Option 1: Linkerd
Option 2: Istio Service Mesh
`,
    summaryText: 'Ingress Gateway Service Mesh',
  };

  it('normalizes phrases and produces bonded tokens', () => {
    expect(cleanPhrase('`Google Secret Manager`')).toBe('google secret manager');
    expect(toBondedToken('Google Secret Manager')).toBe('google_secret_manager');
    expect(toBondedToken('service-mesh')).toBe('service_mesh');
  });

  it('harvests structural cues, acronyms, and compound domain phrases across documents', () => {
    const harvester = new VocabularyHarvester();
    harvester.buildFromDocuments([mockDoc1, mockDoc2]);

    const terms = harvester.getAllTerms();
    expect(terms.length).toBeGreaterThan(0);

    const termNames = terms.map((t) => t.term);

    // Structural: backticks
    expect(termNames).toContain('google_secret_manager');

    // Structural: option titles
    expect(termNames).toContain('hashicorp_consul');

    // Acronyms
    expect(termNames).toContain('gke');
    expect(termNames).toContain('mtls');

    // Headers and clause shingles
    expect(termNames).toContain('service_mesh');
    expect(termNames).toContain('runtime_configuration');
  });

  it('bonds multi-word phrases into compound tokens', () => {
    const harvester = new VocabularyHarvester();
    harvester.buildFromDocuments([mockDoc1, mockDoc2]);

    const inputProse = 'We configure Google Secret Manager alongside an ingress Service Mesh on GKE.';
    const bonded = harvester.bondPhrases(inputProse);

    expect(bonded).toContain('google_secret_manager');
    expect(bonded).toContain('service_mesh');
    expect(bonded).toContain('GKE');
  });
});
