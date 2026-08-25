/**
 * Evaluates a dice formula using Foundry's own Roll class and posts it as a chat card.
 *
 * @param {{ formula: string; flavor?: string; speakerAlias?: string; whisperTo?: string[]; rollMode?: string }} params
 */
export async function rollAndPost(params) {
  const { formula, flavor, speakerAlias, whisperTo, rollMode } = params;
  if (!formula || typeof formula !== 'string') {
    throw new Error('formula is required and must be a string');
  }

  const roll = await new Roll(formula).evaluate();
  const messageData = {};
  if (flavor) messageData.flavor = flavor;
  if (speakerAlias) messageData.speaker = { alias: speakerAlias };
  if (Array.isArray(whisperTo) && whisperTo.length > 0) messageData.whisper = whisperTo;

  await roll.toMessage(messageData, { rollMode: rollMode ?? 'publicroll' });

  return {
    formula: roll.formula,
    total: roll.total,
    result: roll.result,
  };
}
