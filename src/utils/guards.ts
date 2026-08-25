/**
 * @fileoverview Canonical runtime type guards shared across the server.
 */

/**
 * Narrows an unknown value to a plain keyed object.
 *
 * Arrays are excluded: every caller here uses this before reading named fields
 * off a FoundryVTT document payload, and an array would satisfy `typeof ===
 * 'object'` while having none of them.
 *
 * This proves only that the value is an object — its fields stay `unknown` and
 * must each be checked (or parsed with Zod at the boundary) before use.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
