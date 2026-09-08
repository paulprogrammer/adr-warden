import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpServer } from '../src/mcp.js';
import { resolve } from 'node:path';

describe('MCP Progressive Disclosure Modes', () => {
  const cacheDir = resolve(__dirname, '../.test-cache');

  it('construct mode registers only construction and shared tools', async () => {
    const { server } = createMcpServer({
      adrDirs: [],
      cacheDir,
      mode: 'construct',
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-construct', version: '1.0.0' }, { capabilities: {} });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    expect(toolNames).toContain('align_changeset');
    expect(toolNames).toContain('fetch_adr_index');
    expect(toolNames).toContain('search_adrs');
    expect(toolNames).toContain('get_adr');
    expect(toolNames).toContain('list_adrs');

    // Authoring-only tools should NOT be present
    expect(toolNames).not.toContain('check_adr_overlap');
    expect(toolNames).not.toContain('index_adrs');
    expect(toolNames).not.toContain('adr_graph_lineage');
    expect(toolNames).not.toContain('adr_graph_impact');
    expect(toolNames).not.toContain('adr_graph_validate');
    expect(toolNames).not.toContain('adr_graph_mermaid');
    expect(toolNames).not.toContain('list_adr_vocabulary');

    await client.close();
    await server.close();
  });

  it('author mode registers only authoring and shared tools', async () => {
    const { server } = createMcpServer({
      adrDirs: [],
      cacheDir,
      mode: 'author',
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-author', version: '1.0.0' }, { capabilities: {} });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    expect(toolNames).toContain('check_adr_overlap');
    expect(toolNames).toContain('index_adrs');
    expect(toolNames).toContain('adr_graph_lineage');
    expect(toolNames).toContain('search_adrs');
    expect(toolNames).toContain('get_adr');
    expect(toolNames).toContain('list_adrs');

    // Construction tools should NOT be present
    expect(toolNames).not.toContain('align_changeset');
    expect(toolNames).not.toContain('fetch_adr_index');

    await client.close();
    await server.close();
  });

  it('all mode registers both authoring and construction tools', async () => {
    const { server } = createMcpServer({
      adrDirs: [],
      cacheDir,
      mode: 'all',
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-all', version: '1.0.0' }, { capabilities: {} });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);

    expect(toolNames).toContain('align_changeset');
    expect(toolNames).toContain('fetch_adr_index');
    expect(toolNames).toContain('check_adr_overlap');
    expect(toolNames).toContain('index_adrs');
    expect(toolNames).toContain('adr_graph_lineage');
    expect(toolNames).toContain('search_adrs');
    expect(toolNames).toContain('get_adr');
    expect(toolNames).toContain('list_adrs');

    await client.close();
    await server.close();
  });
});
