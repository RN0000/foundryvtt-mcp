import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getImageSize } from '../image-size.js';

/** Builds a minimal-but-valid PNG file: signature + IHDR carrying width/height. */
function buildPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25); // 4 length + 4 "IHDR" + 13 payload + 4 CRC (CRC unused by our reader)
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([signature, ihdr]);
}

/** Builds a minimal JPEG: SOI + APP0 (to be skipped) + SOF0 carrying height/width. */
function buildJpeg(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0Payload = Buffer.from('JFIF\0');
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0]),
    Buffer.from([0, app0Payload.length + 2]),
    app0Payload,
  ]);
  const sof0Payload = Buffer.alloc(6);
  sof0Payload.writeUInt8(8, 0); // precision
  sof0Payload.writeUInt16BE(height, 1);
  sof0Payload.writeUInt16BE(width, 3);
  sof0Payload.writeUInt8(3, 5); // component count
  const sof0 = Buffer.concat([
    Buffer.from([0xff, 0xc0]),
    Buffer.from([0, sof0Payload.length + 2]),
    sof0Payload,
  ]);
  return Buffer.concat([soi, app0, sof0]);
}

/** Builds a minimal WebP VP8X (extended-format) container carrying width/height. */
function buildWebpVp8x(width: number, height: number): Buffer {
  const header = Buffer.alloc(30);
  header.write('RIFF', 0);
  header.writeUInt32LE(22, 4); // file size (unused by our reader)
  header.write('WEBP', 8);
  header.write('VP8X', 12);
  header.writeUInt32LE(10, 16); // VP8X chunk size
  header.writeUInt8(0, 20); // flags
  // 3 reserved bytes at 21-23
  const w = width - 1;
  const h = height - 1;
  header[24] = w & 0xff;
  header[25] = (w >> 8) & 0xff;
  header[26] = (w >> 16) & 0xff;
  header[27] = h & 0xff;
  header[28] = (h >> 8) & 0xff;
  header[29] = (h >> 16) & 0xff;
  return header;
}

describe('getImageSize', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'image-size-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads PNG dimensions from the IHDR chunk', () => {
    const path = join(dir, 'test.png');
    writeFileSync(path, buildPng(1680, 1120));
    expect(getImageSize(path)).toEqual({ width: 1680, height: 1120 });
  });

  it('reads JPEG dimensions by walking marker segments past APP0', () => {
    const path = join(dir, 'test.jpg');
    writeFileSync(path, buildJpeg(2048, 1536));
    expect(getImageSize(path)).toEqual({ width: 2048, height: 1536 });
  });

  it('reads WebP VP8X (extended-format) dimensions', () => {
    const path = join(dir, 'test.webp');
    writeFileSync(path, buildWebpVp8x(900, 600));
    expect(getImageSize(path)).toEqual({ width: 900, height: 600 });
  });

  it('returns null for a missing file', () => {
    expect(getImageSize(join(dir, 'nope.png'))).toBeNull();
  });

  it('returns null for an unsupported/unrecognized format', () => {
    const path = join(dir, 'test.bin');
    writeFileSync(path, Buffer.from('not an image, just text padding out to length'));
    expect(getImageSize(path)).toBeNull();
  });

  it('returns null for a truncated PNG missing the IHDR bytes', () => {
    const path = join(dir, 'truncated.png');
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(getImageSize(path)).toBeNull();
  });
});
