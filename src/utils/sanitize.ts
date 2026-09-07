/**
 * @fileoverview Sanitization utilities for safe string processing.
 */

/**
 * Strips HTML tags from a string iteratively to prevent incomplete multi-character sanitization bypasses.
 *
 * @param input - The raw input string containing potential HTML tags
 * @returns Clean plain text with all HTML tags stripped
 */
export function stripHtml(input: string): string {
  if (!input) {
    return '';
  }
  let prev = '';
  let curr = input;
  while (curr !== prev) {
    prev = curr;
    curr = curr.replace(/<[^<>]*>/g, '');
  }
  return curr;
}
