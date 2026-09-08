import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMcpServer } from '../src/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { resolve, join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

describe('MCP Server Integration via InMemoryTransport', () => {
  const testCacheDir = join(__dirname, '.test-mcp-cache');
  const targetAdrDir = resolve(__dirname, '../docs/adr');
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }

    const { server, init } = createMcpServer({
      adrDirs: [targetAdrDir],
      cacheDir: testCacheDir,
    });

    await init();

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({
      name: 'test-agent',
      version: '1.0.0',
    });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  }, 60000);

  afterAll(async () => {
    await client.close();
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it('lists registered tools', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);

    expect(names).toContain('check_adr_overlap');
    expect(names).toContain('search_adrs');
    expect(names).toContain('get_adr');
    expect(names).toContain('list_adrs');
    expect(names).toContain('index_adrs');
    expect(names).toContain('adr_graph_lineage');
    expect(names).toContain('adr_graph_impact');
    expect(names).toContain('adr_graph_dependencies');
    expect(names).toContain('adr_graph_validate');
    expect(names).toContain('adr_graph_mermaid');
    expect(names).toContain('list_adr_vocabulary');
  });

  it('calls search_adrs tool', async () => {
    const result = await client.callTool({
      name: 'search_adrs',
      arguments: {
        query: 'immutable container image promotion and digest verification',
        top_k: 2,
      },
    });

    expect(result.content).toBeDefined();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('ADR-0004');
    expect(text).toContain('Immutable');
  });

  it('calls check_adr_overlap tool with duplicate proposal', async () => {
    const result = await client.callTool({
      name: 'check_adr_overlap',
      arguments: {
        title: 'Static File Runtime Configuration Strategy',
        context: 'Initial platform deployments relied on environment-specific JSON and YAML configuration files baked directly into machine images, causing operational friction and configuration drift.',
        decision: 'Bake static config files per environment into host machine images to achieve rapid initial bootstrap reliability.',
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('DUPLICATE_RISK');
    expect(text).toContain('ADR-0001');
    expect(text).toContain('HALT net-new ADR creation');
  });

  it('calls get_adr tool', async () => {
    const result = await client.callTool({
      name: 'get_adr',
      arguments: {
        id: '0001',
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('ADR-0001: Static File Runtime Configuration');
    expect(text).toContain('Context and Problem Statement');
  });

  it('calls list_adrs tool', async () => {
    const result = await client.callTool({
      name: 'list_adrs',
      arguments: {},
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Indexed ADR Catalog');
    expect(text).toContain('0001');
    expect(text).toContain('0002');
  });

  it('reads adr://catalog resource', async () => {
    const resource = await client.readResource({
      uri: 'adr://catalog',
    });

    expect(resource.contents).toBeDefined();
    const json = JSON.parse(resource.contents[0].text as string);
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
    expect(json.some((item: any) => item.id === '0001')).toBe(true);
  });

  it('calls adr_graph_validate tool', async () => {
    const result = await client.callTool({
      name: 'adr_graph_validate',
      arguments: {},
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('ADR Knowledge Graph Validation Report');
    expect(text).toContain('Nodes Evaluated');
  });

  it('calls adr_graph_impact tool', async () => {
    const result = await client.callTool({
      name: 'adr_graph_impact',
      arguments: {
        id: '0001',
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Architectural Impact Analysis: ADR-0001');
    expect(text).toContain('Blast Radius Score');
  });

  it('calls adr_graph_lineage tool', async () => {
    const result = await client.callTool({
      name: 'adr_graph_lineage',
      arguments: {
        id: '0001',
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Lineage Report for ADR-0001');
    expect(text).toContain('Active Canonical Standard');
  });

  it('calls adr_graph_mermaid tool', async () => {
    const result = await client.callTool({
      name: 'adr_graph_mermaid',
      arguments: {
        focus_id: '0001',
        radius: 1,
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('flowchart TD');
    expect(text).toContain('N_0001');
  });

  it('reads adr://graph/validation resource', async () => {
    const resource = await client.readResource({
      uri: 'adr://graph/validation',
    });

    expect(resource.contents).toBeDefined();
    const data = JSON.parse(resource.contents[0].text as string);
    expect(data.totalNodes).toBeGreaterThan(0);
    expect(Array.isArray(data.errors)).toBe(true);
    expect(Array.isArray(data.warnings)).toBe(true);
  });

  it('calls list_adr_vocabulary tool', async () => {
    const result = await client.callTool({
      name: 'list_adr_vocabulary',
      arguments: {
        min_docs: 1,
        limit: 10,
      },
    });

    expect(result.content).toBeDefined();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('In-Situ Architectural Vocabulary');
  });

  it('reads adr://vocabulary resource', async () => {
    const resource = await client.readResource({
      uri: 'adr://vocabulary',
    });

    expect(resource.contents).toBeDefined();
    const data = JSON.parse(resource.contents[0].text as string);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('term');
    expect(data[0]).toHaveProperty('docCount');
  });
});
