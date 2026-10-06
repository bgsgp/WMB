import { describe, it, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../src/browser/manager.js';
import { AuthStore } from '../../src/auth/store.js';
import { DeepSeekProvider } from '../../src/providers/deepseek/index.js';
import type { StreamEvent } from '../../src/core/stream.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const TMP_DIR = join(tmpdir(), `wmb-ds-full-${Date.now()}`);
const AUTH_PATH = join(process.env.HOME ?? '~', 'Documents/zero0330/openclaw-zero-token/.openclaw-upstream-state/agents/main/agent/auth-profiles.json');

let bm: BrowserManager;
let authStore: AuthStore;
let profile: any;

function parseCookies(cookieStr: string, domain: string) {
  return cookieStr.split(';').map(s => s.trim()).filter(Boolean).map(pair => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) return null;
    return { name: pair.substring(0, eqIdx), value: pair.substring(eqIdx + 1), domain, path: '/' };
  }).filter(Boolean) as any[];
}

beforeAll(async () => {
  mkdirSync(TMP_DIR, { recursive: true });
  const data = JSON.parse(readFileSync(AUTH_PATH, 'utf-8'));
  profile = JSON.parse(data.profiles['deepseek-web:default'].token);

  bm = new BrowserManager({
    profileDir: join(TMP_DIR, 'p'),
    startupTimeout: 30_000, idleShutdown: 0, loginTimeout: 300,
    cdpUrl: 'http://127.0.0.1:9222', mode: 'attach',
  });
  authStore = new AuthStore(TMP_DIR);
  authStore.setStatus('deepseek-web', 'active');

  const ctx = await bm.ensureBrowser();
  for (const c of parseCookies(profile.cookie, '.deepseek.com')) {
    try { await ctx.addCookies([c]); } catch {}
  }
}, 30_000);

afterAll(async () => {
  await bm?.shutdown();
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('DeepSeek full flow', () => {
  it('direct provider chat with all events logged', async () => {
    const getPage = (origin: string) => bm.getPageForOrigin(origin);
    const browserFetch = (url: string, init: RequestInit) => bm.fetchInBrowser(url, init);
    const provider = new DeepSeekProvider(authStore, browserFetch, getPage);
    provider.setBearerToken(profile.bearer);

    const events: StreamEvent[] = [];
    for await (const ev of provider.chat({
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: 'Say exactly: "HELLO"' }],
      stream: false,
    })) {
      events.push(ev);
      console.log('  event:', JSON.stringify(ev).substring(0, 200));
    }
    console.log(`  Total: ${events.length} events`);
    console.log(`  Types: ${events.map(e => e.type).join(', ')}`);
  }, 120_000);
});
