/**
 * Real E2E tests: connect to Chrome via CDP, inject cookies from OpenClaw
 * auth-profiles, and test actual AI provider APIs.
 *
 * Prerequisites:
 *   - Chrome running with --remote-debugging-port=9222
 *   - OpenClaw auth-profiles.json with valid tokens
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { createApp } from '../../src/server.js';
import { ProviderRegistry } from '../../src/core/registry.js';
import { AuthStore } from '../../src/auth/store.js';
import { BrowserManager } from '../../src/browser/manager.js';
import { ClaudeProvider } from '../../src/providers/claude/index.js';
import { ChatGPTProvider } from '../../src/providers/chatgpt/index.js';
import { DeepSeekProvider } from '../../src/providers/deepseek/index.js';
import { KimiProvider } from '../../src/providers/kimi-web/index.js';
import { QwenProvider } from '../../src/providers/qwen-web/index.js';
import { GLMProvider } from '../../src/providers/glm-web/index.js';
import { GrokProvider } from '../../src/providers/grok-web/index.js';
import { GeminiProvider } from '../../src/providers/gemini-web/index.js';
import { PerplexityProvider } from '../../src/providers/perplexity-web/index.js';
import { DoubaoProvider } from '../../src/providers/doubao-web/index.js';
import { XiaomimoProvider } from '../../src/providers/xiaomimo-web/index.js';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

/* ── Config ── */

const CDP_URL = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const STATE_DIR = join(tmpdir(), `wmb-real-e2e-${Date.now()}`);
const AUTH_PROFILES_PATH = join(
  process.env.HOME ?? '~',
  'Documents/zero0330/openclaw-zero-token/.openclaw-upstream-state/agents/main/agent/auth-profiles.json'
);
const CHAT_TIMEOUT = 120_000;

/* ── Auth profile helpers ── */

function loadAuthProfiles(): Record<string, any> {
  if (!existsSync(AUTH_PROFILES_PATH)) return {};
  const data = JSON.parse(readFileSync(AUTH_PROFILES_PATH, 'utf-8'));
  const result: Record<string, any> = {};
  for (const [key, profile] of Object.entries(data.profiles ?? {})) {
    const p = profile as any;
    if (p.token) {
      try {
        result[key] = JSON.parse(p.token);
      } catch {
        result[key] = { raw: p.token };
      }
    }
  }
  return result;
}

function parseCookies(cookieStr: string, domain: string) {
  return cookieStr.split(';').map(s => s.trim()).filter(Boolean).map(pair => {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) return null;
    return { name: pair.substring(0, eqIdx), value: pair.substring(eqIdx + 1), domain, path: '/' };
  }).filter(Boolean) as any[];
}

/* ── Shared state ── */

let browserManager: BrowserManager;
let registry: ProviderRegistry;
let authStore: AuthStore;
let serverUrl: string;
let serverClose: () => void;
let profiles: Record<string, any>;
const authenticatedProviders = new Set<string>();

beforeAll(async () => {
  // Check Chrome CDP
  let cdpOk = false;
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(3000) });
    cdpOk = res.ok;
  } catch { /* ignored */ }
  if (!cdpOk) throw new Error(`Chrome CDP not reachable at ${CDP_URL}`);

  mkdirSync(STATE_DIR, { recursive: true });
  profiles = loadAuthProfiles();

  browserManager = new BrowserManager({
    profileDir: join(STATE_DIR, 'profile'),
    startupTimeout: 30_000,
    idleShutdown: 0,
    loginTimeout: 300,
    cdpUrl: CDP_URL,
    mode: 'attach',
  });

  authStore = new AuthStore(STATE_DIR);

  // Inject cookies from auth-profiles into browser context
  const ctx = await browserManager.ensureBrowser();
  const cookieInjections: Record<string, string> = {
    'claude-web:default': '.claude.ai',
    'chatgpt-web:default': '.chatgpt.com',
    'deepseek-web:default': '.deepseek.com',
    'kimi-web:default': '.kimi.com',
    'qwen-web:default': '.qwen.ai',
    'glm-web:default': '.chatglm.cn',
    'grok-web:default': '.grok.com',
    'gemini-web:default': '.google.com',
    'perplexity-web:default': '.perplexity.ai',
    'doubao-web:default': '.doubao.com',
    'xiaomimo-web:default': '.xiaomimimo.com',
  };

  for (const [profileKey, domain] of Object.entries(cookieInjections)) {
    const profile = profiles[profileKey];
    if (profile?.cookie) {
      const cookies = parseCookies(profile.cookie, domain);
      if (cookies.length > 0) {
        // Inject cookies one-by-one, skip invalid ones
        let injected = 0;
        for (const cookie of cookies) {
          try {
            // Skip cookies with empty names or values that might cause issues
            if (!cookie.name || cookie.name.length === 0) continue;
            await ctx.addCookies([cookie]);
            injected++;
          } catch {
            // Skip invalid cookies silently
          }
        }
        if (injected > 0) {
          const providerId = profileKey.replace(':default', '');
          authStore.setStatus(providerId, 'active');
          authenticatedProviders.add(providerId);
        }
      }
    }
  }

  // Browser callbacks
  const browserFetch = (url: string, init: RequestInit) =>
    browserManager.fetchInBrowser(url, init);
  const getPage = (origin: string) =>
    browserManager.getPageForOrigin(origin);

  // Register all providers
  registry = new ProviderRegistry();

  const claudeProvider = new ClaudeProvider(authStore, browserFetch, getPage);
  registry.register(claudeProvider);

  const deepseekProvider = new DeepSeekProvider(authStore, browserFetch, getPage);
  // Inject bearer token for DeepSeek
  if (profiles['deepseek-web:default']?.bearer) {
    deepseekProvider.setBearerToken(profiles['deepseek-web:default'].bearer);
  }
  registry.register(deepseekProvider);

  registry.register(new ChatGPTProvider(authStore, browserFetch));
  registry.register(new KimiProvider(authStore, browserFetch, getPage));
  registry.register(new QwenProvider(authStore, browserFetch, getPage));
  registry.register(new GLMProvider(authStore, browserFetch, getPage));
  registry.register(new GrokProvider(authStore, browserFetch));
  registry.register(new GeminiProvider(authStore, browserFetch));
  registry.register(new PerplexityProvider(authStore, browserFetch));
  registry.register(new DoubaoProvider(authStore, browserFetch, getPage));
  registry.register(new XiaomimoProvider(authStore, browserFetch));

  // Start server
  const app = createApp({ registry, authStore, authToken: null });
  const server = serve({ fetch: app.fetch, port: 0 });
  const addr = server.address() as AddressInfo;
  serverUrl = `http://127.0.0.1:${addr.port}`;
  serverClose = () => server.close();

  console.log(`\n  E2E server at ${serverUrl}`);
  console.log(`  Authenticated providers: ${[...authenticatedProviders].join(', ')}`);
}, 60_000);

afterAll(async () => {
  serverClose?.();
  await browserManager?.shutdown();
  rmSync(STATE_DIR, { recursive: true, force: true });
});

/* ── Helpers ── */

async function chatCompletion(model: string, prompt: string, stream = false) {
  return fetch(`${serverUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream,
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT),
  });
}

function skipIfNotAuth(providerId: string) {
  if (!authenticatedProviders.has(providerId)) {
    console.log(`    ⏭ skipping ${providerId}: no auth-profile credentials`);
    return true;
  }
  return false;
}

/* ── Infrastructure Tests ── */

describe('E2E: Infrastructure', () => {
  it('health check', async () => {
    const res = await fetch(`${serverUrl}/webmodel/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  it('GET /v1/models lists real provider models', async () => {
    const res = await fetch(`${serverUrl}/v1/models`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    console.log(`    ${body.data.length} models available`);
  });

  it('unknown model returns 400', async () => {
    const res = await chatCompletion('fake/model', 'Hi');
    expect(res.status).toBe(400);
  });
});

/* ── Provider Tests ── */

describe('E2E: DeepSeek', () => {
  it('non-streaming chat', async () => {
    if (skipIfNotAuth('deepseek-web')) return;
    const res = await chatCompletion('deepseek-web/deepseek-flash', 'Reply with exactly: "E2E_OK"', false);
    console.log(`    status: ${res.status}`);
    if (res.status !== 200) {
      const body = await res.json();
      console.log(`    error: ${JSON.stringify(body.error)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content.length).toBeGreaterThan(0);
    console.log(`    response: ${body.choices[0].message.content.substring(0, 80)}`);
  }, CHAT_TIMEOUT);

  it('streaming chat', async () => {
    if (skipIfNotAuth('deepseek-web')) return;
    const res = await chatCompletion('deepseek-web/deepseek-flash', 'Say hello briefly', true);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Verify actual content, not just SSE structure
    const hasContent = text.split('\n')
      .filter(l => l.startsWith('data: {'))
      .some(l => {
        try {
          const d = JSON.parse(l.slice(6));
          return d.choices?.[0]?.delta?.content?.length > 0;
        } catch { return false; }
      });
    expect(hasContent).toBe(true);
    console.log(`    streamed ${text.length} bytes with content`);
  }, CHAT_TIMEOUT);
});

describe('E2E: Claude', () => {
  it('non-streaming chat', async () => {
    if (skipIfNotAuth('claude-web')) return;
    const res = await chatCompletion('claude-web/claude-sonnet-4-6', 'Reply with exactly: "E2E_OK"', false);
    console.log(`    status: ${res.status}`);
    if (res.status !== 200) {
      const body = await res.json();
      console.log(`    error: ${JSON.stringify(body.error)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content.length).toBeGreaterThan(0);
    console.log(`    response: ${body.choices[0].message.content.substring(0, 80)}`);
  }, CHAT_TIMEOUT);
});

describe('E2E: Qwen', () => {
  it('non-streaming chat', async () => {
    if (skipIfNotAuth('qwen-web')) return;
    const res = await chatCompletion('qwen-web/qwen-3.5-plus', 'Reply with exactly: "E2E_OK"', false);
    console.log(`    status: ${res.status}`);
    if (res.status !== 200) {
      const body = await res.json();
      console.log(`    error: ${JSON.stringify(body.error)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content.length).toBeGreaterThan(0);
    console.log(`    response: ${body.choices[0].message.content.substring(0, 80)}`);
  }, CHAT_TIMEOUT);
});

describe('E2E: GLM', () => {
  it('non-streaming chat', async () => {
    if (skipIfNotAuth('glm-web')) return;
    const res = await chatCompletion('glm-web/glm-5', 'Reply with exactly: "E2E_OK"', false);
    console.log(`    status: ${res.status}`);
    if (res.status !== 200) {
      const body = await res.json();
      console.log(`    error: ${JSON.stringify(body.error)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content.length).toBeGreaterThan(0);
    console.log(`    response: ${body.choices[0].message.content.substring(0, 80)}`);
  }, CHAT_TIMEOUT);
});

describe('E2E: Doubao', () => {
  it('non-streaming chat', async () => {
    if (skipIfNotAuth('doubao-web')) return;
    const res = await chatCompletion('doubao-web/doubao-seed-2.0-pro', 'Reply with exactly: "E2E_OK"', false);
    console.log(`    status: ${res.status}`);
    if (res.status !== 200) {
      const body = await res.json();
      console.log(`    error: ${JSON.stringify(body.error)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content.length).toBeGreaterThan(0);
    console.log(`    response: ${body.choices[0].message.content.substring(0, 80)}`);
  }, CHAT_TIMEOUT);
});

describe('E2E: Kimi', () => {
  it('non-streaming chat', async () => {
    if (skipIfNotAuth('kimi-web')) return;
    const res = await chatCompletion('kimi-web/kimi-k2.5', 'Reply with exactly: "E2E_OK"', false);
    console.log(`    status: ${res.status}`);
    if (res.status !== 200) {
      const body = await res.json();
      console.log(`    error: ${JSON.stringify(body.error)}`);
    }
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content.length).toBeGreaterThan(0);
    console.log(`    response: ${body.choices[0].message.content.substring(0, 80)}`);
  }, CHAT_TIMEOUT);
});
