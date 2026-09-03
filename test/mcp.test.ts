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
    expect(text).toContain('ADR-0002');
    expect(text).toContain('Immutable');
  });

  it('calls check_adr_overlap tool with duplicate proposal', async () => {
    const result = await client.callTool({
      name: 'check_adr_overlap',
      arguments: {
        title: 'Immutable Digest Promotion Lifecycle',
        context: 'Using mutable container tags leads to non-deterministic deployments. We need an immutable promotion standard.',
        decision: 'Build images once, tag by sha256 immutable digest, and promote across environments without rebuilding.',
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('DUPLICATE_RISK');
    expect(text).toContain('ADR-0002');
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
    expect(text).toContain('ADR-0001: Runtime Configuration Management Strategy');
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
});
