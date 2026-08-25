/**
 * @fileoverview Tests for the upload_asset tool handler.
 */

import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleBridge } from '../../../foundry/module-bridge.js';
import { handleUploadAsset } from '../module-bridge.js';

function buildBridge(sendImpl: (type: string, params: Record<string, unknown>) => unknown) {
  return {
    send: vi.fn(sendImpl),
  } as unknown as ModuleBridge;
}

describe('handleUploadAsset', () => {
  it('uploads via contentBase64 and infers mimeType from the filename extension', async () => {
    const bridge = buildBridge(() => ({ path: 'assets/uploads/map.png' }));
    const result = await handleUploadAsset(
      { targetDir: 'assets/uploads', filename: 'map.png', contentBase64: 'aGVsbG8=' },
      bridge,
    );
    expect(result.content[0].text).toContain('assets/uploads/map.png');
    expect(bridge.send).toHaveBeenCalledWith('upload_asset', {
      targetDir: 'assets/uploads',
      filename: 'map.png',
      contentBase64: 'aGVsbG8=',
      mimeType: 'image/png',
    });
  });

  it('rejects when both contentBase64 and sourcePath are provided', async () => {
    const bridge = buildBridge(() => ({ path: 'x' }));
    await expect(
      handleUploadAsset(
        {
          targetDir: 'assets',
          filename: 'a.png',
          contentBase64: 'aGVsbG8=',
          sourcePath: '/tmp/a.png',
        },
        bridge,
      ),
    ).rejects.toThrow(/Exactly one of contentBase64 or sourcePath/);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('rejects when neither contentBase64 nor sourcePath is provided', async () => {
    const bridge = buildBridge(() => ({ path: 'x' }));
    await expect(
      handleUploadAsset({ targetDir: 'assets', filename: 'a.png' }, bridge),
    ).rejects.toThrow(/Exactly one of contentBase64 or sourcePath/);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('rejects a contentBase64 payload estimated over the 8 MiB limit', async () => {
    const bridge = buildBridge(() => ({ path: 'x' }));
    // Estimated decoded size = length * 3/4; need > 8 MiB (8388608 bytes).
    const oversized = 'A'.repeat(11_184_812);
    await expect(
      handleUploadAsset(
        { targetDir: 'assets', filename: 'huge.png', contentBase64: oversized },
        bridge,
      ),
    ).rejects.toThrow(/exceeds the 8 MiB upload limit/);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('rejects when the module bridge is not configured', async () => {
    await expect(
      handleUploadAsset(
        { targetDir: 'assets', filename: 'a.png', contentBase64: 'aGVsbG8=' },
        null,
      ),
    ).rejects.toThrow(/FOUNDRY_MODULE_BRIDGE_ENABLED/);
  });

  it('rejects a missing targetDir', async () => {
    const bridge = buildBridge(() => ({ path: 'x' }));
    await expect(
      handleUploadAsset({ targetDir: '', filename: 'a.png', contentBase64: 'aGVsbG8=' }, bridge),
    ).rejects.toThrow(McpError);
  });

  it('rejects a malformed result shape from the module', async () => {
    const bridge = buildBridge(() => ({ nonsense: true }));
    await expect(
      handleUploadAsset(
        { targetDir: 'assets', filename: 'a.png', contentBase64: 'aGVsbG8=' },
        bridge,
      ),
    ).rejects.toThrow(/unexpected upload_asset shape/);
  });
});
