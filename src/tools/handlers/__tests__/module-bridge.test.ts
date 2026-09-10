import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleBridge } from '../../../foundry/module-bridge.js';
import {
  handleGetDocumentSchema,
  handleRollAndPost,
  handleSearchCompendiumContent,
} from '../module-bridge.js';

describe('handleGetDocumentSchema', () => {
  function buildBridge(sendImpl: (type: string, params: Record<string, unknown>) => unknown) {
    return {
      send: vi.fn(sendImpl),
    } as unknown as ModuleBridge;
  }

  it('formats a schema result as a labeled JSON code block', async () => {
    const bridge = buildBridge(() => ({
      documentType: 'Actor',
      type: 'character',
      fields: { stats: { type: 'Schema', fields: {} } },
    }));

    const result = await handleGetDocumentSchema(
      { documentType: 'Actor', type: 'character' },
      bridge,
    );

    const text = result.content[0].text;
    expect(text).toContain('Actor Schema: character');
    expect(text).toContain('```json');
    expect(text).toContain('"stats"');
    expect(bridge.send).toHaveBeenCalledWith('get_document_schema', {
      documentType: 'Actor',
      type: 'character',
    });
  });

  it('rejects a documentType other than Actor or Item', async () => {
    const bridge = buildBridge(() => ({}));
    await expect(
      handleGetDocumentSchema({ documentType: 'Scene' as unknown as 'Actor', type: 'x' }, bridge),
    ).rejects.toThrow(McpError);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('rejects a missing type', async () => {
    const bridge = buildBridge(() => ({}));
    await expect(
      handleGetDocumentSchema({ documentType: 'Item', type: '' }, bridge),
    ).rejects.toThrow(McpError);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('rejects when the module bridge is not configured', async () => {
    await expect(
      handleGetDocumentSchema({ documentType: 'Actor', type: 'character' }, null),
    ).rejects.toThrow(/FOUNDRY_MODULE_BRIDGE_ENABLED/);
  });

  it('propagates a not-connected error from the bridge', async () => {
    const bridge = buildBridge(() => {
      throw new Error('No Foundry module connected to the bridge.');
    });
    await expect(
      handleGetDocumentSchema({ documentType: 'Actor', type: 'character' }, bridge),
    ).rejects.toThrow(/No Foundry module connected/);
  });

  it('propagates an unknown-type error surfaced by the module', async () => {
    const bridge = buildBridge(() => {
      throw new Error('Unknown Actor type: "bogus". Valid types for this world: character, npc');
    });
    await expect(
      handleGetDocumentSchema({ documentType: 'Actor', type: 'bogus' }, bridge),
    ).rejects.toThrow(/Unknown Actor type/);
  });

  it('rejects a malformed result shape from the module', async () => {
    const bridge = buildBridge(() => ({ nonsense: true }));
    await expect(
      handleGetDocumentSchema({ documentType: 'Actor', type: 'character' }, bridge),
    ).rejects.toThrow(/unexpected get_document_schema shape/);
  });
});

describe('handleSearchCompendiumContent', () => {
  function buildBridge(sendImpl: (type: string, params: Record<string, unknown>) => unknown) {
    return {
      send: vi.fn(sendImpl),
    } as unknown as ModuleBridge;
  }

  it('formats compendium search results with snippets', async () => {
    const bridge = buildBridge(() => ({
      results: [
        {
          packId: 'cpr.weapons',
          packLabel: 'Weapons',
          documentId: 'doc1234567890123',
          documentName: 'Heavy Pistol',
          documentType: 'Item',
          matchedIn: 'content',
          snippet: 'A standard heavy pistol dealing 3d6 damage.',
        },
      ],
      total: 1,
    }));

    const result = await handleSearchCompendiumContent({ query: 'heavy pistol' }, bridge);
    expect(result.content[0].text).toContain('**Compendium Content Matches** (1)');
    expect(result.content[0].text).toContain('Heavy Pistol');
    expect(result.content[0].text).toContain('[content match]');
    expect(result.content[0].text).toContain('3d6 damage');
  });

  it('reports empty result nicely', async () => {
    const bridge = buildBridge(() => ({ results: [], total: 0 }));
    const result = await handleSearchCompendiumContent({ query: 'nonexistent' }, bridge);
    expect(result.content[0].text).toContain('No compendium matches found for "nonexistent"');
  });

  it('rejects when bridge is null', async () => {
    await expect(handleSearchCompendiumContent({ query: 'x' }, null)).rejects.toThrow(McpError);
  });
});

describe('handleRollAndPost', () => {
  function buildBridge(sendImpl: (type: string, params: Record<string, unknown>) => unknown) {
    return {
      send: vi.fn(sendImpl),
    } as unknown as ModuleBridge;
  }

  it('evaluates and posts roll via bridge', async () => {
    const bridge = buildBridge(() => ({
      formula: '4d6kh3',
      total: 15,
      result: '5 + 5 + 5 (dropped 2)',
    }));

    const result = await handleRollAndPost({ formula: '4d6kh3', flavor: 'Stat Roll' }, bridge);
    expect(result.content[0].text).toContain('Dice Rolled & Posted to Chat');
    expect(result.content[0].text).toContain('4d6kh3');
    expect(result.content[0].text).toContain('15');
    expect(result.content[0].text).toContain('Stat Roll');
    expect(bridge.send).toHaveBeenCalledWith('roll_and_post', {
      formula: '4d6kh3',
      flavor: 'Stat Roll',
    });
  });

  it('rejects missing formula', async () => {
    const bridge = buildBridge(() => ({}));
    await expect(handleRollAndPost({ formula: '' }, bridge)).rejects.toThrow(McpError);
  });
});
