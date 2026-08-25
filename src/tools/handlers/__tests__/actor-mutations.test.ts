import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { FoundryClient } from '../../../foundry/client.js';
import type {
  ActorAttributeUpdateResult,
  FoundryItem,
  WorldActor,
} from '../../../foundry/types.js';
import { handleCreateFullActor, handleUpdateActorAttribute } from '../actor-mutations.js';

const VALID_ID = 'aaaaaaaaaaaaaaaa'; // 16 alphanumeric chars

describe('Actor mutation handlers', () => {
  const createMockClient = (
    impl?: (
      actorId: string,
      patch: Record<string, number | string | boolean>,
    ) => ActorAttributeUpdateResult | Promise<ActorAttributeUpdateResult>,
  ): FoundryClient => {
    return {
      updateActorAttribute: vi.fn(
        impl ??
          ((_actorId: string, patch: Record<string, number | string | boolean>) => ({
            success: true,
            updatedAttributes: { ...patch },
          })),
      ),
    } as unknown as FoundryClient;
  };

  describe('handleUpdateActorAttribute', () => {
    it('round-trips HP value and echoes the updated path', async () => {
      const mockClient = createMockClient();
      const result = await handleUpdateActorAttribute(
        { actorId: VALID_ID, patch: { 'attributes.hp.value': 30 } },
        mockClient,
      );

      const text = result.content[0].text;
      expect(result.content[0].type).toBe('text');
      expect(text).toContain('Actor Attributes Updated');
      expect(text).toContain('**attributes.hp.value** → 30');
      expect(text).toContain('Success');
    });

    it('round-trips a spell-slot value', async () => {
      const mockClient = createMockClient();
      const result = await handleUpdateActorAttribute(
        { actorId: VALID_ID, patch: { 'spells.spell1.value': 2 } },
        mockClient,
      );

      expect(result.content[0].text).toContain('**spells.spell1.value** → 2');
    });

    it('round-trips a resource/currency value', async () => {
      const mockClient = createMockClient();
      const result = await handleUpdateActorAttribute(
        { actorId: VALID_ID, patch: { 'currency.gp': 12, 'resources.primary.value': 3 } },
        mockClient,
      );

      const text = result.content[0].text;
      expect(text).toContain('**currency.gp** → 12');
      expect(text).toContain('**resources.primary.value** → 3');
    });

    it('propagates a not-found error from the client', async () => {
      const mockClient = createMockClient(() => {
        throw new Error(`Actor not found: ${VALID_ID}`);
      });

      await expect(
        handleUpdateActorAttribute(
          { actorId: VALID_ID, patch: { 'attributes.hp.value': 5 } },
          mockClient,
        ),
      ).rejects.toThrow(/Failed to update actor attributes/);
    });

    it('propagates the write-disabled guard error', async () => {
      const mockClient = createMockClient(() => {
        throw new Error(
          'Write operations are disabled. Set FOUNDRY_WRITE_ENABLED=true to allow game-state mutation.',
        );
      });

      await expect(
        handleUpdateActorAttribute(
          { actorId: VALID_ID, patch: { 'attributes.hp.value': 5 } },
          mockClient,
        ),
      ).rejects.toThrow(/FOUNDRY_WRITE_ENABLED/);
    });

    it('rejects a missing actorId before reaching the client', async () => {
      const mockClient = createMockClient();
      await expect(
        handleUpdateActorAttribute(
          { actorId: '', patch: { 'attributes.hp.value': 5 } },
          mockClient,
        ),
      ).rejects.toThrow(McpError);
      expect(mockClient.updateActorAttribute).not.toHaveBeenCalled();
    });

    it('rejects an empty patch before reaching the client', async () => {
      const mockClient = createMockClient();
      await expect(
        handleUpdateActorAttribute({ actorId: VALID_ID, patch: {} }, mockClient),
      ).rejects.toThrow(McpError);
      expect(mockClient.updateActorAttribute).not.toHaveBeenCalled();
    });

    it('rejects a non-object patch before reaching the client', async () => {
      const mockClient = createMockClient();
      await expect(
        handleUpdateActorAttribute(
          {
            actorId: VALID_ID,
            patch: 'nope' as unknown as Record<string, number>,
          },
          mockClient,
        ),
      ).rejects.toThrow(McpError);
    });
  });

  describe('handleCreateFullActor', () => {
    const createFullActorMockClient = (
      impl?: (
        name: string,
        type: string,
        options: {
          system?: Record<string, unknown>;
          folder?: string;
          items?: Array<{ name: string; type: string; system?: Record<string, unknown> }>;
        },
      ) => Promise<{
        actor: WorldActor;
        items: FoundryItem[];
        itemErrors: Array<{ name: string; error: string }>;
      }>,
    ): FoundryClient => {
      return {
        createFullActor: vi.fn(
          impl ??
            (async (name: string, type: string) => ({
              actor: { _id: VALID_ID, name, type, system: {} },
              items: [],
              itemErrors: [],
            })),
        ),
      } as unknown as FoundryClient;
    };

    it('reports the created actor and every created item', async () => {
      const mockClient = createFullActorMockClient(async (name, type) => ({
        actor: { _id: VALID_ID, name, type, system: {} },
        items: [
          { _id: 'itemAAAAAAAAAAAA', name: 'Test Pistol', type: 'weapon' },
          { _id: 'itemBBBBBBBBBBBB', name: 'Athletics', type: 'skill' },
        ],
        itemErrors: [],
      }));

      const result = await handleCreateFullActor(
        {
          name: 'Rook',
          type: 'character',
          items: [
            { name: 'Test Pistol', type: 'weapon' },
            { name: 'Athletics', type: 'skill' },
          ],
        },
        mockClient,
      );

      const text = result.content[0].text;
      expect(text).toContain('Full Actor Created');
      expect(text).toContain('Rook');
      expect(text).toContain('Items Created (2)');
      expect(text).toContain('Test Pistol (weapon)');
      expect(text).toContain('Athletics (skill)');
      expect(text).not.toContain('Item Failures');
    });

    it('reports partial item failures without failing the whole call', async () => {
      const mockClient = createFullActorMockClient(async (name, type) => ({
        actor: { _id: VALID_ID, name, type, system: {} },
        items: [{ _id: 'itemAAAAAAAAAAAA', name: 'Test Pistol', type: 'weapon' }],
        itemErrors: [{ name: 'Bogus Item', error: 'Invalid item type: bogus' }],
      }));

      const result = await handleCreateFullActor(
        {
          name: 'Rook',
          type: 'character',
          items: [
            { name: 'Test Pistol', type: 'weapon' },
            { name: 'Bogus Item', type: 'bogus' },
          ],
        },
        mockClient,
      );

      const text = result.content[0].text;
      expect(text).toContain('Items Created (1)');
      expect(text).toContain('Item Failures (1)');
      expect(text).toContain('Bogus Item: Invalid item type: bogus');
    });

    it('reports zero items created when none were requested', async () => {
      const mockClient = createFullActorMockClient();
      const result = await handleCreateFullActor({ name: 'Rook', type: 'character' }, mockClient);
      expect(result.content[0].text).toContain('Items Created (0)');
      expect(result.content[0].text).toContain('_none_');
    });

    it('rejects a missing name before reaching the client', async () => {
      const mockClient = createFullActorMockClient();
      await expect(
        handleCreateFullActor({ name: '', type: 'character' }, mockClient),
      ).rejects.toThrow(McpError);
      expect(mockClient.createFullActor).not.toHaveBeenCalled();
    });

    it('rejects a missing type before reaching the client', async () => {
      const mockClient = createFullActorMockClient();
      await expect(handleCreateFullActor({ name: 'Rook', type: '' }, mockClient)).rejects.toThrow(
        McpError,
      );
      expect(mockClient.createFullActor).not.toHaveBeenCalled();
    });

    it('rejects a non-array items field before reaching the client', async () => {
      const mockClient = createFullActorMockClient();
      await expect(
        handleCreateFullActor(
          { name: 'Rook', type: 'character', items: 'nope' as unknown as [] },
          mockClient,
        ),
      ).rejects.toThrow(McpError);
      expect(mockClient.createFullActor).not.toHaveBeenCalled();
    });

    it('propagates the write-disabled guard error', async () => {
      const mockClient = createFullActorMockClient(() => {
        throw new Error(
          'Write operations are disabled. Set FOUNDRY_WRITE_ENABLED=true to allow game-state mutation.',
        );
      });
      await expect(
        handleCreateFullActor({ name: 'Rook', type: 'character' }, mockClient),
      ).rejects.toThrow(/FOUNDRY_WRITE_ENABLED/);
    });
  });

  // --------------------------------------------------------------------------
  // Client-level validation (exercises the real updateActorAttribute logic).
  // --------------------------------------------------------------------------
  describe('FoundryClient.updateActorAttribute validation', () => {
    type SocketEmitMock = (
      event: string,
      payload: unknown,
      cb: (response: unknown) => void,
    ) => void;

    const buildClient = (opts: {
      writeEnabled?: boolean;
      connected?: boolean;
      actor?: Record<string, unknown>;
      rawActor?: Record<string, unknown>;
    }) => {
      const client = new FoundryClient({
        baseUrl: 'http://localhost:30000',
        writeEnabled: opts.writeEnabled ?? true,
      });
      if (opts.actor) {
        vi.spyOn(client, 'getActor').mockResolvedValue(
          opts.actor as unknown as Awaited<ReturnType<FoundryClient['getActor']>>,
        );
      }
      vi.spyOn(client, 'getRawActor').mockReturnValue(
        opts.rawActor as unknown as ReturnType<FoundryClient['getRawActor']>,
      );
      // Install a mock Socket.IO socket. The modifyDocument ack echoes the
      // update object back as the server's `result`, mirroring FoundryVTT.
      const emit = vi.fn(((_event, payload, cb) => {
        const op = (payload as { operation?: { updates?: Array<Record<string, unknown>> } })
          .operation;
        cb({ result: op?.updates ? [op.updates[0]] : [] });
      }) as SocketEmitMock);
      if (opts.connected !== false) {
        (client as unknown as { socket: { connected: boolean; emit: SocketEmitMock } }).socket = {
          connected: true,
          emit,
        };
      }
      return client;
    };

    it('rejects writes when FOUNDRY_WRITE_ENABLED is false', async () => {
      const client = buildClient({ writeEnabled: false });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.hp.value': 5 }),
      ).rejects.toThrow(/FOUNDRY_WRITE_ENABLED/);
    });

    it('rejects writes when the Socket.IO connection is not active', async () => {
      const client = buildClient({ writeEnabled: true, connected: false });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.hp.value': 5 }),
      ).rejects.toThrow(/Socket\.IO connection/);
    });

    it('rejects a malformed actor id', async () => {
      const client = buildClient({});
      await expect(
        client.updateActorAttribute('short', { 'attributes.hp.value': 5 }),
      ).rejects.toThrow(/Invalid actorId/);
    });

    // In REST mode getActor returns the raw FoundryVTT document, so HP bounds
    // live at system.attributes.hp — NOT the mapped top-level `hp`. These cases
    // assert validation reads from the raw system shape (no socket cache).
    it('rejects HP above max + temp (REST raw-document shape)', async () => {
      const client = buildClient({
        actor: {
          _id: VALID_ID,
          name: 'Hero',
          type: 'character',
          system: { attributes: { hp: { value: 10, max: 20, temp: 0 } } },
        },
      });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.hp.value': 25 }),
      ).rejects.toThrow(/exceeds max \+ temp/);
    });

    it('allows HP up to max + temp (REST raw-document shape)', async () => {
      const client = buildClient({
        actor: {
          _id: VALID_ID,
          name: 'Hero',
          type: 'character',
          system: { attributes: { hp: { value: 10, max: 20, temp: 5 } } },
        },
      });
      const result = await client.updateActorAttribute(VALID_ID, { 'attributes.hp.value': 25 });
      expect(result.success).toBe(true);
      expect(result.updatedAttributes['attributes.hp.value']).toBe(25);
    });

    // Socket mode: getActor returns the mapped actor (top-level `hp`) and the
    // raw system comes from the world cache. Validation must still enforce the
    // cap by falling back to the mapped HP bounds.
    it('rejects HP above max + temp (socket mapped-actor fallback)', async () => {
      const client = buildClient({
        actor: {
          _id: VALID_ID,
          name: 'Hero',
          type: 'character',
          hp: { value: 10, max: 20, temp: 0 },
        },
        rawActor: { _id: VALID_ID, name: 'Hero', type: 'character', system: {} },
      });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.hp.value': 25 }),
      ).rejects.toThrow(/exceeds max \+ temp/);
    });

    it('rejects a spell slot above its max', async () => {
      const client = buildClient({
        actor: { _id: VALID_ID, name: 'Mage', type: 'character', hp: { value: 8, max: 8 } },
        rawActor: {
          _id: VALID_ID,
          name: 'Mage',
          type: 'character',
          system: { spells: { spell1: { value: 0, max: 3 } } },
        },
      });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'spells.spell1.value': 4 }),
      ).rejects.toThrow(/exceeds max/);
    });

    it('rejects exhaustion out of the 0-10 range', async () => {
      const client = buildClient({
        actor: { _id: VALID_ID, name: 'Hero', type: 'character', hp: { value: 8, max: 8 } },
        rawActor: { _id: VALID_ID, name: 'Hero', type: 'character', system: {} },
      });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.exhaustion': 11 }),
      ).rejects.toThrow(/between 0 and 10/);
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.exhaustion': -1 }),
      ).rejects.toThrow(/between 0 and 10/);
    });

    it('applies the 2014 exhaustion cap of 6 when the actor uses legacy rules', async () => {
      const client = buildClient({
        actor: { _id: VALID_ID, name: 'Hero', type: 'character', hp: { value: 8, max: 8 } },
        rawActor: {
          _id: VALID_ID,
          name: 'Hero',
          type: 'character',
          system: { rules: '2014' },
        },
      });
      await expect(
        client.updateActorAttribute(VALID_ID, { 'attributes.exhaustion': 7 }),
      ).rejects.toThrow(/between 0 and 6/);
    });

    it('emits a system-prefixed modifyDocument update and returns updated values', async () => {
      const client = buildClient({
        actor: { _id: VALID_ID, name: 'Hero', type: 'character', hp: { value: 8, max: 20 } },
        rawActor: { _id: VALID_ID, name: 'Hero', type: 'character', system: {} },
      });
      const result = await client.updateActorAttribute(VALID_ID, {
        'attributes.hp.value': 15,
        'currency.gp': 12,
      });
      expect(result.success).toBe(true);
      expect(result.updatedAttributes['attributes.hp.value']).toBe(15);
      expect(result.updatedAttributes['currency.gp']).toBe(12);

      // Verify the modifyDocument request: dot-paths prefixed with `system.`,
      // wrapped in an Actor update operation over the socket.
      const emitMock = (client as unknown as { socket: { emit: ReturnType<typeof vi.fn> } }).socket
        .emit;
      const [event, body] = emitMock.mock.calls[0];
      expect(event).toBe('modifyDocument');
      expect(body).toMatchObject({
        type: 'Actor',
        action: 'update',
        operation: {
          updates: [{ _id: VALID_ID, 'system.attributes.hp.value': 15, 'system.currency.gp': 12 }],
          broadcast: true,
          pack: null,
        },
      });
    });
  });

  // --------------------------------------------------------------------------
  // Client-level validation (exercises the real createFullActor logic).
  // --------------------------------------------------------------------------
  describe('FoundryClient.createFullActor', () => {
    type SocketEmitMock = (
      event: string,
      payload: unknown,
      cb: (response: unknown) => void,
    ) => void;

    let nextId = 0;
    /** 16-char alphanumeric id (matches FOUNDRY_ID_PATTERN) — prefix ignored, kept for call-site readability. */
    const freshId = (_prefix: string) => `id${String(++nextId).padStart(14, '0')}`;

    /** Actor create always succeeds; Item create fails for any item named "Bogus Item". */
    const buildClient = (writeEnabled = true) => {
      const client = new FoundryClient({ baseUrl: 'http://localhost:30000', writeEnabled });
      const emit = vi.fn(((_event, payload, cb) => {
        const req = payload as {
          type: string;
          action: string;
          operation: { data?: Array<Record<string, unknown>> };
        };
        const doc = req.operation.data?.[0];
        if (req.type === 'Item' && doc?.name === 'Bogus Item') {
          cb({ error: { message: `Invalid item type: ${doc.type}` } });
          return;
        }
        const prefix = req.type === 'Actor' ? 'actor' : 'item';
        cb({ result: [{ ...doc, _id: freshId(prefix) }] });
      }) as SocketEmitMock);
      (client as unknown as { socket: { connected: boolean; emit: SocketEmitMock } }).socket = {
        connected: true,
        emit,
      };
      return { client, emit };
    };

    it('creates the actor with no items when none are requested', async () => {
      const { client } = buildClient();
      const result = await client.createFullActor('Rook', 'character');
      expect(result.actor.name).toBe('Rook');
      expect(result.items).toEqual([]);
      expect(result.itemErrors).toEqual([]);
    });

    it('creates the actor then every item on it, in order', async () => {
      const { client, emit } = buildClient();
      const result = await client.createFullActor('Rook', 'character', {
        system: { stats: { ref: { value: 8 } } },
        items: [
          { name: 'Test Pistol', type: 'weapon' },
          { name: 'Athletics', type: 'skill', system: { level: 4 } },
        ],
      });

      expect(result.actor.name).toBe('Rook');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.name).toBe('Test Pistol');
      expect(result.items[1]?.name).toBe('Athletics');
      expect(result.itemErrors).toEqual([]);

      // First call creates the Actor; every subsequent call creates an Item
      // parented to the actor that was just returned.
      const calls = emit.mock.calls.map(([, payload]) => payload as { type: string });
      expect(calls[0]?.type).toBe('Actor');
      expect(calls[1]?.type).toBe('Item');
      expect(calls[2]?.type).toBe('Item');
      const [, itemPayload] = emit.mock.calls[1] ?? [];
      const parentUuid =
        itemPayload &&
        typeof itemPayload === 'object' &&
        'operation' in itemPayload &&
        itemPayload.operation &&
        typeof itemPayload.operation === 'object' &&
        'parentUuid' in itemPayload.operation
          ? itemPayload.operation.parentUuid
          : undefined;
      expect(parentUuid).toBe(`Actor.${result.actor._id}`);
    });

    it('reports a failed item without losing the actor or the items that succeeded', async () => {
      const { client } = buildClient();
      const result = await client.createFullActor('Rook', 'character', {
        items: [
          { name: 'Test Pistol', type: 'weapon' },
          { name: 'Bogus Item', type: 'bogus' },
          { name: 'Athletics', type: 'skill' },
        ],
      });

      expect(result.actor.name).toBe('Rook');
      expect(result.items.map((i) => i.name)).toEqual(['Test Pistol', 'Athletics']);
      expect(result.itemErrors).toEqual([
        { name: 'Bogus Item', error: 'FoundryVTT rejected create Item: Invalid item type: bogus' },
      ]);
    });

    it('rejects an item with no name before creating the actor', async () => {
      const { client, emit } = buildClient();
      await expect(
        client.createFullActor('Rook', 'character', {
          items: [{ name: '', type: 'weapon' }],
        }),
      ).rejects.toThrow(/requires a name/);
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects an item with no type before creating the actor', async () => {
      const { client, emit } = buildClient();
      await expect(
        client.createFullActor('Rook', 'character', {
          items: [{ name: 'Mystery Box', type: '' }],
        }),
      ).rejects.toThrow(/"Mystery Box" requires a type/);
      expect(emit).not.toHaveBeenCalled();
    });

    it('rejects writes when FOUNDRY_WRITE_ENABLED is false', async () => {
      const { client } = buildClient(false);
      await expect(client.createFullActor('Rook', 'character')).rejects.toThrow(
        /FOUNDRY_WRITE_ENABLED/,
      );
    });
  });
});
