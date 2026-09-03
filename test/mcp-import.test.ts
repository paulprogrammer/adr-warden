import { describe, it, expect } from 'vitest';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

describe('McpServer Tools, Resources and Prompts API', () => {
  it('registers tools, resources and prompts', () => {
    const server = new McpServer({
      name: 'adr-search-engine',
      version: '1.0.0',
    });

    server.tool(
      'search_adrs',
      'Search indexed ADRs using vector similarity',
      {
        query: z.string(),
      },
      async ({ query }) => ({
        content: [{ type: 'text', text: query }],
      })
    );

    server.resource(
      'adr-catalog',
      'adr://catalog',
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: 'catalog',
          },
        ],
      })
    );

    server.prompt(
      'check-draft-adr',
      'Prompt template for checking draft ADR prior art',
      {
        title: z.string(),
      },
      ({ title }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Check for prior art on ADR: ${title}`,
            },
          },
        ],
      })
    );

    expect(server).toBeDefined();
  });
});
