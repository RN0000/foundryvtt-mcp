/**
 * @fileoverview Minimal, dependency-free image dimension reader.
 *
 * Scene backgrounds and tile textures are plain files on FoundryVTT's local
 * `Data` directory (PNG/JPEG/WebP in practice for the asset packs this
 * server's scene/tile tools work with). Reading true pixel dimensions from
 * disk means `create_scene`/`create_tile` never have to ask the caller to
 * guess a width/height — the number one source of misaligned grids and
 * off-canvas tiles when doing this by hand.
 *
 * Each format is detected by magic bytes and parsed from its own minimal
 * header structure — no image decoding, just the size fields every format
 * stores near the front of the file.
 */

import { closeSync, openSync, readSync } from 'node:fs';

export interface ImageSize {
  width: number;
  height: number;
}

/** True if `buf` starts with the 8-byte PNG signature. */
function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

/** PNG: width/height are a fixed 8 bytes into the mandatory IHDR chunk (offset 16). */
function pngSize(buf: Buffer): ImageSize {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** True if `buf` starts with the JPEG SOI marker (0xFFD8). */
function isJpeg(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * JPEG: no fixed offset — width/height live in whichever Start-Of-Frame
 * marker (0xC0-0xCF, excluding the DHT/JPG/DAC markers 0xC4/0xC8/0xCC) the
 * file actually uses, reached by walking the marker segment chain from the
 * SOI. Each segment after the marker byte pair carries a 2-byte big-endian
 * length (including itself); SOF segments store height then width 3 bytes
 * into their payload.
 */
function jpegSize(buf: Buffer): ImageSize | null {
  let offset = 2; // past the 0xFFD8 SOI marker
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      // Not aligned on a marker — bail rather than mis-scan garbage.
      return null;
    }
    const marker = buf[offset + 1] as number;
    // Standalone markers with no length/payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > buf.length) {
        return null;
      }
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** True if `buf` starts with a RIFF....WEBP container header. */
function isWebp(buf: Buffer): boolean {
  return (
    buf.length >= 30 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  );
}

/**
 * WebP: dimensions are encoded differently per sub-format (VP8, VP8L, VP8X)
 * following the 12-byte RIFF/WEBP header. Only the three sub-formats
 * FoundryVTT/browsers actually produce are handled.
 */
function webpSize(buf: Buffer): ImageSize | null {
  const fourCc = buf.toString('ascii', 12, 16);
  if (fourCc === 'VP8X') {
    // Extended format: 24-bit little-endian canvas width/height minus one, at offset 24/27.
    const width = (buf[24] as number) | ((buf[25] as number) << 8) | ((buf[26] as number) << 16);
    const height = (buf[27] as number) | ((buf[28] as number) << 8) | ((buf[29] as number) << 16);
    return { width: width + 1, height: height + 1 };
  }
  if (fourCc === 'VP8 ' && buf.length >= 30) {
    // Lossy: 14-bit width/height (top 2 bits are an unrelated scale flag) at offset 26/28.
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (fourCc === 'VP8L' && buf.length >= 25) {
    // Lossless: a packed 32-bit little-endian field at offset 21 holds
    // 14-bit (width-1) then 14-bit (height-1).
    const bits =
      (buf[21] as number) |
      ((buf[22] as number) << 8) |
      ((buf[23] as number) << 16) |
      ((buf[24] as number) << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  return null;
}

/**
 * Bytes read from the front of each file. All three formats' dimension
 * fields live well inside this window for any file this server actually
 * handles (PNG: fixed 24-byte offset; WebP: fixed ~30-byte offset; JPEG:
 * markers before the first Start-Of-Frame — typically one EXIF/JFIF
 * segment, each capped at 65533 bytes by the format itself). Reading a
 * bounded prefix instead of the whole file keeps `list_scene_assets`
 * cheap even over a folder of multi-megabyte battlemap JPEGs.
 */
const HEADER_READ_BYTES = 262144;

/**
 * Reads an image's true pixel dimensions from its header, without decoding
 * pixel data. Supports PNG, JPEG, and WebP — the formats FoundryVTT's own
 * asset pipeline and typical battlemap packs use. Reads only a bounded
 * prefix of the file ({@link HEADER_READ_BYTES}), not the full contents.
 *
 * @param absolutePath - filesystem path to the image file
 * @returns dimensions, or null if the file is missing, unreadable, not one
 *   of the supported formats, or the dimension fields fall outside the
 *   read window (pathological — not expected for real map/prop art)
 */
export function getImageSize(absolutePath: string): ImageSize | null {
  let fd: number;
  try {
    fd = openSync(absolutePath, 'r');
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(HEADER_READ_BYTES);
    const bytesRead = readSync(fd, buf, 0, HEADER_READ_BYTES, 0);
    const header = buf.subarray(0, bytesRead);
    if (isPng(header)) {
      return pngSize(header);
    }
    if (isJpeg(header)) {
      return jpegSize(header);
    }
    if (isWebp(header)) {
      return webpSize(header);
    }
    return null;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}
