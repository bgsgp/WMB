/**
 * Direct provider testing — calls provider.chat() directly to diagnose issues.
 * No HTTP layer, no formatting — raw StreamEvent output.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../src/browser/manager.js';
import { AuthStore } from '../../src/auth/store.js';
import { DeepSeekProvider } from '../../src/providers/deepseek/index.js';
import { ClaudeProvider } from '../../src/providers/claude/index.js';
import { QwenProvider } from '../../src/providers/qwen-web/index.js';
import { DoubaoProvider } from '../../src/providers/doubao-web/index.js';
import type { StreamEvent } from '../../src/core/stream.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';

const CDP_URL = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const AUTH_DIR = process.env.WMB_AUTH_SRC ?? join(process.env.HOME ?? '~', '.webmodel');
const TMP_DIR = join(tmpdir(), `wmb-direct-${Date.now()}`);

let browserManager: BrowserManager;
let authStore: AuthStore;

beforeAll(async () => {
  mkdirSync(TMP_DIR, { recursive: true });

  browserManager = new BrowserManager({
    profileDir: join(TMP_DIR, 'profile'),
    startupTimeout: 30_000,
    idleShutdown: 0,
    loginTimeout: 300,
    cdpUrl: CDP_URL,
    mode: 'attach',
  });

  authStore = new AuthStore(AUTH_DIR);
}, 30_000);

afterAll(async () => {
  await browserManager?.shutdown();
  rmSync(TMP_DIR, { recursive: true, force: true });
});

async function collectEvents(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of iterable) {
    events.push(ev);
  }
  return events;
}

describe('Direct: DeepSeek', () => {
  it('chat yields text_delta events', async () => {
    const getPage = (origin: string) => browserManager.getPageForOrigin(origin);
    const browserFetch = (url: string, init: RequestInit) => browserManager.fetchInBrowser(url, init);
    const provider = new DeepSeekProvider(authStore, browserFetch, getPage);

    console.log('    auth:', await provider.isAuthenticated());

    const events = await collectEvents(
      provider.chat({
        model: 'deepseek-flash',
        messages: [{ role: 'user', content: 'Say exactly: "DIRECT_TEST_OK"' }],
        stream: false,
      })
    );

    console.log('    events received:', events.length);
    for (const ev of events) {
      if (ev.type === 'error') console.log('    ERROR:', ev.message);
      if (ev.type === 'text_delta') console.log('    text_delta:', ev.delta.substring(0, 60));
      if (ev.type === 'done') console.log('    done:', ev.reason);
    }

    const textEvents = events.filter(e => e.type === 'text_delta');
    const errorEvents = events.filter(e => e.type === 'error');

    if (errorEvents.length > 0) {
      console.log('    FULL ERROR:', JSON.stringify(errorEvents));
    }

    expect(errorEvents).toHaveLength(0);
    expect(textEvents.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('Direct: Claude', () => {
  it('chat yields text_delta events', async () => {
    const getPage = (origin: string) => browserManager.getPageForOrigin(origin);
    const browserFetch = (url: string, init: RequestInit) => browserManager.fetchInBrowser(url, init);
    const provider = new ClaudeProvider(authStore, browserFetch, getPage);

    console.log('    auth:', await provider.isAuthenticated());

    const events = await collectEvents(
      provider.chat({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Say exactly: "DIRECT_TEST_OK"' }],
        stream: false,
      })
    );

    console.log('    events received:', events.length);
    for (const ev of events) {
      if (ev.type === 'error') console.log('    ERROR:', ev.message);
      if (ev.type === 'text_delta') console.log('    text_delta:', ev.delta.substring(0, 60));
      if (ev.type === 'done') console.log('    done:', ev.reason);
    }

    const textEvents = events.filter(e => e.type === 'text_delta');
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents).toHaveLength(0);
    expect(textEvents.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('Direct: Qwen', () => {
  it('chat yields text_delta events', async () => {
    const browserFetch = (url: string, init: RequestInit) => browserManager.fetchInBrowser(url, init);
    const provider = new QwenProvider(authStore, browserFetch);

    console.log('    auth:', await provider.isAuthenticated());

    const events = await collectEvents(
      provider.chat({
        model: 'qwen-3.5-plus',
        messages: [{ role: 'user', content: 'Say exactly: "DIRECT_TEST_OK"' }],
        stream: false,
      })
    );

    console.log('    events received:', events.length);
    for (const ev of events) {
      if (ev.type === 'error') console.log('    ERROR:', ev.message);
      if (ev.type === 'text_delta') console.log('    text_delta:', ev.delta.substring(0, 60));
      if (ev.type === 'done') console.log('    done:', ev.reason);
    }

    const textEvents = events.filter(e => e.type === 'text_delta');
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents).toHaveLength(0);
    expect(textEvents.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('Direct: Doubao', () => {
  it('chat yields text_delta events', async () => {
    const browserFetch = (url: string, init: RequestInit) => browserManager.fetchInBrowser(url, init);
    const provider = new DoubaoProvider(authStore, browserFetch);

    console.log('    auth:', await provider.isAuthenticated());

    const events = await collectEvents(
      provider.chat({
        model: 'doubao-seed-2.0-pro',
        messages: [{ role: 'user', content: 'Say exactly: "DIRECT_TEST_OK"' }],
        stream: false,
      })
    );

    console.log('    events received:', events.length);
    for (const ev of events) {
      if (ev.type === 'error') console.log('    ERROR:', ev.message);
      if (ev.type === 'text_delta') console.log('    text_delta:', ev.delta.substring(0, 60));
      if (ev.type === 'done') console.log('    done:', ev.reason);
    }

    const textEvents = events.filter(e => e.type === 'text_delta');
    const errorEvents = events.filter(e => e.type === 'error');
    expect(errorEvents).toHaveLength(0);
    expect(textEvents.length).toBeGreaterThan(0);
  }, 120_000);
});
