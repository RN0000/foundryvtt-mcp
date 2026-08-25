import { describe, expect, it } from 'vitest';
import { stripHtml } from '../sanitize.js';

describe('stripHtml', () => {
  it('handles empty strings and nullish values', () => {
    expect(stripHtml('')).toBe('');
  });

  it('strips simple HTML tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('handles nested and malformed tags iteratively', () => {
    expect(stripHtml('<<script>script>alert(1)</script>')).toBe('alert(1)');
  });

  it('preserves text without HTML tags', () => {
    expect(stripHtml('Just plain text 123')).toBe('Just plain text 123');
  });
});
