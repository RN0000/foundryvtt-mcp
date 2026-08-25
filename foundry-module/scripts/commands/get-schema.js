/**
 * Introspects a game system's real DataModel schema for an Actor or Item
 * type, so a caller can learn exactly what fields `create_world_actor` /
 * `create_actor_item` / `create_full_actor` expect *before* guessing at a
 * `system` payload — for whichever system is installed, not just one.
 *
 * FoundryVTT v10+ unifies both schema styles (a system's own `DataModel`
 * subclass, or the older declarative `template.json`) under the same
 * `DataModel` machinery: every document's `.system` is itself a `DataModel`
 * instance with a `.schema` (a `SchemaField` describing every sub-field).
 * Constructing a throwaway, never-saved document of the requested type and
 * reading `.system.schema` therefore works identically regardless of which
 * schema style the system authors chose.
 */

const MAX_DEPTH = 8;

/** Strips the trailing "Field" Foundry appends to every DataField class name. */
function fieldKind(field) {
  return field.constructor.name.replace(/Field$/, '');
}

/**
 * Recursively describes one DataField as a JSON-safe plain object:
 * `{ type, required?, nullable?, choices?, initial?, fields?, element? }`.
 *
 * `initial` is omitted on `SchemaField` nodes (`fields` present) — it would
 * just be the aggregate of every child's own `initial`, which `fields`
 * already conveys, so including both is pure duplication in an already
 * large payload.
 */
function describeField(field, depth) {
  if (depth > MAX_DEPTH) {
    return { type: fieldKind(field), truncated: true };
  }

  const out = { type: fieldKind(field) };
  if (field.required !== undefined) out.required = Boolean(field.required);
  if (field.nullable) out.nullable = true;
  if (field.choices) {
    out.choices = Array.isArray(field.choices) ? field.choices : Object.keys(field.choices);
  }

  if (field.fields) {
    // SchemaField: recurse into named sub-fields, skip the redundant `initial`.
    out.fields = {};
    for (const [key, sub] of Object.entries(field.fields)) {
      out.fields[key] = describeField(sub, depth + 1);
    }
    return out;
  }

  if (field.element) {
    // ArrayField/SetField: describe the element type once, not per-entry.
    out.element = describeField(field.element, depth + 1);
    out.initial = [];
    return out;
  }

  // Leaf field (Number/String/Boolean/HTML/DocumentId/…). `initial` can be a
  // factory function on some field types (e.g. one deriving from other
  // fields) — only literal values are JSON-safe and worth reporting.
  try {
    const init = typeof field.getInitialValue === 'function' ? field.getInitialValue() : field.initial;
    if (init !== undefined && typeof init !== 'function') out.initial = init;
  } catch {
    // Some fields' initial value depends on sibling data not available on a
    // bare probe document — leave `initial` unset rather than fail the walk.
  }

  return out;
}

/**
 * @param {{documentType: 'Actor'|'Item', type: string}} params
 * @returns {{documentType: string, type: string, fields: Record<string, unknown>}}
 */
export function getDocumentSchema({ documentType, type }) {
  if (documentType !== 'Actor' && documentType !== 'Item') {
    throw new Error(`Invalid documentType: ${documentType}. Must be "Actor" or "Item"`);
  }
  if (typeof type !== 'string' || !type) {
    throw new Error('type is required and must be a string');
  }

  const validTypes = game.documentTypes[documentType] ?? [];
  if (!validTypes.includes(type)) {
    throw new Error(
      `Unknown ${documentType} type: "${type}". Valid types for this world: ${validTypes.filter((t) => t !== 'base').join(', ')}`,
    );
  }

  const documentClass = documentType === 'Actor' ? CONFIG.Actor.documentClass : CONFIG.Item.documentClass;
  // Never saved — constructing a Document does not touch the database.
  const probe = new documentClass({ name: '_schema_probe_', type });
  const schema = probe.system.schema;

  const fields = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    fields[key] = describeField(field, 0);
  }

  return { documentType, type, fields };
}
