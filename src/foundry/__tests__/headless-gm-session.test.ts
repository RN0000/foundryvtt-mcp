/**
 * @fileoverview Tests for the automatic headless GM browser session.
 */

import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeadlessGmSession } from '../headless-gm-session.js';

const launchMock = vi.fn();
vi.mock('playwright-core', () => ({
  chromium: { launch: (...args: unknown[]) => launchMock(...args) },
}));

/** Minimal fake of the Playwright `Page` surface this module drives. */
interface FakePage {
  on: Mock;
  mainFrame: Mock;
  goto: Mock;
  waitForSelector: Mock;
  evaluate: Mock;
  $: Mock;
  click: Mock;
  waitForURL: Mock;
  url: Mock;
  close: Mock;
  /** Test helper: fires the captured `framenavigated` listener. */
  emitFrameNavigated: (url: string) => void;
}

interface FakeBrowser {
  newPage: Mock;
  close: Mock;
}

/** A fake `page.$()` element handle whose `.fill()` is observable. */
function fakeElementHandle() {
  return { fill: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Builds a fake Playwright `Page`. `state.url` is a mutable ref: `click()`
 * flips it to `/game` when `succeedOnClick` is true, simulating a real
 * navigation — the code under test reads `page.url()` after
 * `click()`/`waitForURL()` settle rather than trusting `waitForURL()`'s own
 * resolution.
 */
function fakePage(state: {
  url: string;
  evaluateResult: boolean;
  succeedOnClick: boolean;
}): FakePage {
  let framenavigatedHandler: ((frame: unknown) => void) | undefined;
  const mainFrame = { url: () => state.url };
  return {
    on: vi.fn((event: string, handler: (frame: unknown) => void) => {
      if (event === 'framenavigated') {
        framenavigatedHandler = handler;
      }
    }),
    mainFrame: vi.fn(() => mainFrame),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async () => state.evaluateResult),
    $: vi.fn().mockResolvedValue(fakeElementHandle()),
    click: vi.fn().mockImplementation(async () => {
      if (state.succeedOnClick) {
        state.url = 'http://localhost:30000/game';
      }
    }),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    url: vi.fn(() => state.url),
    close: vi.fn().mockResolvedValue(undefined),
    emitFrameNavigated(url: string) {
      mainFrame.url = () => url;
      framenavigatedHandler?.(mainFrame);
    },
  };
}

function fakeBrowser(page: FakePage): FakeBrowser {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('HeadlessGmSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    launchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('launches with the chrome channel by default', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: true,
      succeedOnClick: true,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'mcp-api',
      password: 'mcp',
    });
    await session.start();

    expect(launchMock).toHaveBeenCalledWith({ headless: true, channel: 'chrome' });
    await session.stop();
  });

  it('falls back to msedge then bundled chromium when earlier channels fail', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: true,
      succeedOnClick: true,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockRejectedValueOnce(new Error('chrome not found')).mockResolvedValueOnce(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'mcp-api',
      password: 'mcp',
    });
    await session.start();

    expect(launchMock).toHaveBeenNthCalledWith(1, { headless: true, channel: 'chrome' });
    expect(launchMock).toHaveBeenNthCalledWith(2, { headless: true, channel: 'msedge' });
    await session.stop();
  });

  it('throws with a clear message when no browser can be launched at all', async () => {
    launchMock.mockRejectedValue(new Error('not installed'));

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'mcp-api',
      password: 'mcp',
    });

    await expect(session.start()).rejects.toThrow(/FOUNDRY_HEADLESS_GM_EXECUTABLE_PATH/);
    expect(launchMock).toHaveBeenCalledTimes(3);
  });

  it('uses an explicit executablePath without trying any channel', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: true,
      succeedOnClick: true,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'mcp-api',
      password: 'mcp',
      executablePath: '/opt/chrome/chrome',
    });
    await session.start();

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledWith({
      headless: true,
      executablePath: '/opt/chrome/chrome',
    });
    await session.stop();
  });

  it('logs in successfully, filling the password and reporting active status', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: true,
      succeedOnClick: true,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'mcp-api',
      password: 'mcp',
    });
    await session.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(page.goto).toHaveBeenCalledWith('http://localhost:30000/join', {
      waitUntil: 'domcontentloaded',
    });
    expect(session.isActive()).toBe(true);
    expect(session.statusText()).toContain('mcp-api');
    await session.stop();
  });

  it('retries with backoff when the account is not in the join list', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: false,
      succeedOnClick: false,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'missing-user',
      password: 'mcp',
    });
    await session.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(session.isActive()).toBe(false);
    expect(session.statusText()).toContain('No user named "missing-user"');
    expect(page.goto).toHaveBeenCalledTimes(1);

    // Base retry delay (5s) elapses -> a second attempt fires automatically.
    await vi.advanceTimersByTimeAsync(5000);
    expect(page.goto).toHaveBeenCalledTimes(2);

    await session.stop();
  });

  it('re-logs in when the page navigates back to /join while active', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: true,
      succeedOnClick: true,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'mcp-api',
      password: 'mcp',
    });
    await session.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.isActive()).toBe(true);
    expect(page.goto).toHaveBeenCalledTimes(1);

    // Simulate an unrelated logout (world restart, session timeout).
    page.emitFrameNavigated('http://localhost:30000/join');
    expect(session.isActive()).toBe(false);

    await vi.advanceTimersByTimeAsync(0);
    expect(page.goto).toHaveBeenCalledTimes(2);

    await session.stop();
  });

  it('stop() prevents further retries and closes the browser', async () => {
    const state = {
      url: 'http://localhost:30000/join',
      evaluateResult: false,
      succeedOnClick: false,
    };
    const page = fakePage(state);
    const browser = fakeBrowser(page);
    launchMock.mockResolvedValue(browser);

    const session = new HeadlessGmSession({
      foundryUrl: 'http://localhost:30000',
      username: 'missing-user',
      password: 'mcp',
    });
    await session.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(page.goto).toHaveBeenCalledTimes(1);

    await session.stop();
    expect(page.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60000);
    expect(page.goto).toHaveBeenCalledTimes(1);
  });
});
