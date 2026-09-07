/**
 * @fileoverview Content generation tool handlers
 *
 * Handles NPC generation, loot generation, and rule lookups.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { FoundryClient } from '../../foundry/client.js';
import type { ModuleBridge } from '../../foundry/module-bridge.js';
import { stripHtml } from '../../utils/sanitize.js';
import { withToolError } from './utils.js';

/**
 * Handles NPC generation requests
 */
export async function handleGenerateNPC(
  args: {
    level?: number;
    race?: string;
    class?: string;
  },
  _foundryClient: FoundryClient,
) {
  const { level = 1, race, class: characterClass } = args;

  return withToolError('generate NPC', async () => {
    // Generate basic NPC data
    const npcName = generateRandomName();
    const npcRace = race || getRandomRace();
    const npcClass = characterClass || getRandomClass();
    const stats = generateAbilityScores();
    const hp = Math.max(1, Math.floor(Math.random() * (level * 8)) + level);

    return {
      content: [
        {
          type: 'text',
          text: `🧙 **Generated NPC**
**Name:** ${npcName}
**Race:** ${npcRace}
**Class:** ${npcClass}
**Level:** ${level}
**Hit Points:** ${hp}

**Ability Scores:**
**STR:** ${stats.str} | **DEX:** ${stats.dex} | **CON:** ${stats.con}
**INT:** ${stats.int} | **WIS:** ${stats.wis} | **CHA:** ${stats.cha}

**Background:** ${generateBackground(npcRace, npcClass)}`,
        },
      ],
    };
  });
}

/**
 * Handles loot generation requests
 */
export async function handleGenerateLoot(
  args: {
    challengeRating?: number;
    treasureType?: string;
  },
  _foundryClient: FoundryClient,
) {
  const { challengeRating = 1, treasureType = 'individual' } = args;

  return withToolError('generate loot', async () => {
    const loot = generateLootForCR(challengeRating, treasureType);

    return {
      content: [
        {
          type: 'text',
          text: `💰 **Generated Loot**
**Challenge Rating:** ${challengeRating}
**Treasure Type:** ${treasureType}

**Currency:**
${loot.currency.map((c) => `- ${c.amount} ${c.type}`).join('\n')}

**Items:**
${loot.items.map((item) => `- ${item.name} (${item.rarity})`).join('\n')}

**Total Estimated Value:** ${loot.totalValue} gp`,
        },
      ],
    };
  });
}

/**
 * Handles rule lookup requests across world journals and compendium journal packs.
 */
export async function handleLookupRule(
  args: {
    query: string;
  },
  foundryClient: FoundryClient,
  moduleBridge: ModuleBridge | null = null,
) {
  const { query } = args;

  if (!query || typeof query !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'query is required and must be a string');
  }

  return withToolError('lookup rule', async () => {
    const hits: Array<{ title: string; source: string; snippet?: string }> = [];

    // 1. Search world journals
    const worldJournals = foundryClient.searchJournals(query);
    for (const j of worldJournals) {
      for (const page of j.pages ?? []) {
        const text = page.text?.content ?? '';
        const plain = stripHtml(text).replace(/\s+/g, ' ');
        const idx = plain.toLowerCase().indexOf(query.toLowerCase());
        if (idx !== -1) {
          const start = Math.max(0, idx - 60);
          const end = Math.min(plain.length, idx + query.length + 60);
          const snippet =
            (start > 0 ? '...' : '') +
            plain.slice(start, end).trim() +
            (end < plain.length ? '...' : '');
          hits.push({ title: `${j.name} > ${page.name}`, source: 'World Journal', snippet });
        } else if (
          page.name.toLowerCase().includes(query.toLowerCase()) ||
          j.name.toLowerCase().includes(query.toLowerCase())
        ) {
          hits.push({ title: `${j.name} > ${page.name}`, source: 'World Journal' });
        }
      }
    }

    // 2. Search compendium journal packs via module bridge if available
    let compendiumSearched = false;
    if (moduleBridge) {
      try {
        const compResult = (await moduleBridge.send('search_compendium_content', {
          query,
          packType: 'JournalEntry',
          limit: 10,
        })) as { results?: Array<{ documentName: string; packLabel: string; snippet?: string }> };

        if (Array.isArray(compResult?.results)) {
          compendiumSearched = true;
          for (const r of compResult.results) {
            hits.push({
              title: r.documentName,
              source: `Compendium: ${r.packLabel}`,
              ...(r.snippet ? { snippet: r.snippet } : {}),
            });
          }
        }
      } catch {
        // Module bridge failed or unavailable
      }
    }

    if (hits.length === 0) {
      const note = !compendiumSearched
        ? '\n\n_Note: Compendium rules packs were not searched (companion module not connected)._'
        : '';
      return {
        content: [{ type: 'text', text: `📖 **No rules found matching "${query}".**${note}` }],
      };
    }

    const lines = hits.map((h) => {
      const snip = h.snippet ? `\n    > "${h.snippet}"` : '';
      return `- **${h.title}** [_${h.source}_]${snip}`;
    });

    const bridgeNotice = !compendiumSearched
      ? '\n\n_Note: Compendium rules packs were not searched (companion module not connected)._'
      : '';

    return {
      content: [
        {
          type: 'text',
          text: `📖 **Rule Search Results: "${query}"** (${hits.length})\n\n${lines.join('\n')}${bridgeNotice}`,
        },
      ],
    };
  });
}

// Helper functions for content generation

function generateRandomName(): string {
  const firstNames = [
    'Aerdrie',
    'Berris',
    'Cithreth',
    'Drannor',
    'Enna',
    'Galinndan',
    'Halimath',
    'Immeral',
    'Jallarzi',
    'Keth',
  ];
  const lastNames = [
    'Amakir',
    'Amakiir',
    'Galanodel',
    'Holimion',
    'Liadon',
    'Meliamne',
    'Nailo',
    'Siannodel',
    'Xiloscient',
    'Yellowleaf',
  ];

  return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

function getRandomRace(): string {
  const races = [
    'Human',
    'Elf',
    'Dwarf',
    'Halfling',
    'Dragonborn',
    'Gnome',
    'Half-Elf',
    'Half-Orc',
    'Tiefling',
  ];
  return races[Math.floor(Math.random() * races.length)] || 'Human';
}

function getRandomClass(): string {
  const classes = [
    'Fighter',
    'Wizard',
    'Cleric',
    'Rogue',
    'Ranger',
    'Paladin',
    'Barbarian',
    'Bard',
    'Druid',
    'Monk',
    'Sorcerer',
    'Warlock',
  ];
  return classes[Math.floor(Math.random() * classes.length)] || 'Fighter';
}

function generateAbilityScores() {
  const rollStat = () => {
    const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
    rolls.sort((a, b) => b - a);
    return rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0);
  };

  return {
    str: rollStat(),
    dex: rollStat(),
    con: rollStat(),
    int: rollStat(),
    wis: rollStat(),
    cha: rollStat(),
  };
}

function generateBackground(race: string, characterClass: string): string {
  const backgrounds = [
    `A former ${characterClass.toLowerCase()} who seeks redemption for past mistakes.`,
    `A ${race.toLowerCase()} ${characterClass.toLowerCase()} from a distant land, traveling to spread their knowledge.`,
    `Once a member of a secret organization, now working independently.`,
    `A scholar turned adventurer after discovering an ancient mystery.`,
    `A protector of the innocent, dedicated to fighting against evil.`,
  ];

  return (
    backgrounds[Math.floor(Math.random() * backgrounds.length)] ||
    'A mysterious wanderer with an unknown past.'
  );
}

function generateLootForCR(cr: number, _type: string) {
  const baseValue = Math.floor(cr * 100 * (0.5 + Math.random()));

  return {
    currency: [
      { amount: Math.floor(baseValue * 0.1), type: 'gp' as const },
      { amount: Math.floor(baseValue * 0.05), type: 'sp' as const },
      { amount: Math.floor(baseValue * 0.02), type: 'cp' as const },
    ],
    items: [
      { name: 'Healing Potion' as const, rarity: 'Common' as const },
      { name: 'Silver Ring' as const, rarity: 'Common' as const },
    ],
    totalValue: baseValue,
  };
}

function _lookupGameRule(query: string, system: string) {
  // Mock rule lookup - in a real implementation, this would query actual rule databases
  return {
    title: `${query} Rule`,
    description: `Rules and mechanics for ${query} in ${system}.`,
    mechanics: `Detailed explanation of how ${query} works mechanically.`,
    source: `${system} Core Rulebook`,
  };
}
