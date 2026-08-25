/**
 * Retrieves a full document from a compendium pack.
 *
 * @param {{ packId: string; documentId: string }} params
 */
export async function getCompendiumDocument(params) {
  const { packId, documentId } = params;
  if (!packId || !documentId) {
    throw new Error('packId and documentId are required');
  }
  const pack = game.packs.get(packId);
  if (!pack) {
    throw new Error(`Pack not found: ${packId}`);
  }
  const doc = await pack.getDocument(documentId);
  if (!doc) {
    throw new Error(`Document not found in ${packId}: ${documentId}`);
  }
  return doc.toObject();
}
