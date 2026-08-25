/**
 * Searches compendium packs by name and journal entry text content.
 *
 * @param {{ query?: string; packType?: string; limit?: number }} params
 */
export async function searchCompendiumContent(params) {
  const query = (params?.query || '').toLowerCase();
  const packType = params?.packType || 'JournalEntry';
  const limit = typeof params?.limit === 'number' ? params.limit : 20;

  const results = [];
  const packs = game.packs.filter((p) => p.documentName === packType);

  for (const pack of packs) {
    if (results.length >= limit) break;

    // First check pack index for name matches
    const index = pack.index;
    for (const entry of index) {
      if (results.length >= limit) break;
      if (entry.name?.toLowerCase().includes(query)) {
        results.push({
          packId: pack.collection,
          packLabel: pack.title,
          documentId: entry._id,
          documentName: entry.name,
          documentType: pack.documentName,
          matchedIn: 'name',
          snippet: '',
        });
      }
    }

    // For JournalEntry packs, also search text page content
    if (packType === 'JournalEntry' && query) {
      try {
        const docs = await pack.getDocuments();
        for (const doc of docs) {
          if (results.length >= limit) break;
          // Avoid duplicate if already added by name match
          if (results.some((r) => r.packId === pack.collection && r.documentId === doc.id)) {
            continue;
          }
          for (const page of doc.pages ?? []) {
            const rawContent = page.text?.content;
            if (typeof rawContent !== 'string') continue;
            // Strip HTML tags for search and snippet extraction
            const textContent = rawContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
            const idx = textContent.toLowerCase().indexOf(query);
            if (idx !== -1) {
              const start = Math.max(0, idx - 60);
              const end = Math.min(textContent.length, idx + query.length + 60);
              const snippet =
                (start > 0 ? '...' : '') +
                textContent.slice(start, end).trim() +
                (end < textContent.length ? '...' : '');
              results.push({
                packId: pack.collection,
                packLabel: pack.title,
                documentId: doc.id,
                documentName: doc.name,
                documentType: pack.documentName,
                matchedIn: 'content',
                snippet,
              });
              break;
            }
          }
        }
      } catch (err) {
        console.warn(`foundryvtt-mcp-bridge | Failed to search documents in ${pack.collection}:`, err);
      }
    }
  }

  return { results, total: results.length };
}
