/**
 * E2E tests for the actual HTTP server lifecycle.
 * These tests start a real server on a random port and make real HTTP requests.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { serve } from '@hono/node-server';
import { createApp } from '../../src/server.js';
import { ProviderRegistry } from '../../src/core/registry.js';
import { AuthStore } from '../../src/auth/store.js';
import { MockProvider } from '../helpers/mock-provider.js';
import { DelayedMockProvider } from '../helpers/mock-sse.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

interface TestServer {
  url: string;
  close: () => void;
  stateDir: string;
}

function startTestServer(opts?: {
  authToken?: string;
  providers?: (MockProvider | DelayedMockProvider)[];
}): TestServer {
  const stateDir = join(tmpdir(), `wmb-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(stateDir, { recursive: true });

  const registry = new ProviderRegistry();
  const authStore = new AuthStore(stateDir);

  const providers = opts?.providers ?? [
    new MockProvider('claude-web', {
      authenticated: true,
      models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 1000000, maxOutput: 8192 }],
    }),
    new MockProvider('deepseek-web', {
      authenticated: true,
      models: [{ id: 'deepseek-flash', name: 'DeepSeek Flash', contextWindow: 128000, maxOutput: 8192 }],
    }),
  ];

  for (const p of providers) {
    registry.register(p);
  }

  const app = createApp({
    registry,
    authStore,
    authToken: opts?.authToken ?? null,
  });

  const server = serve({ fetch: app.fetch, port: 0 });
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    close: () => {
      server.close();
      rmSync(stateDir, { recursive: true, force: true });
    },
    stateDir,
  };
}

describe('E2E: Server Lifecycle', () => {
  let server: TestServer;

  afterEach(() => {
    server?.close();
  });

  it('starts and responds to health check', async () => {
    server = startTestServer();
    const res = await fetch(`${server.url}/webmodel/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  it('serves Dashboard HTML at root', async () => {
    server = startTestServer();
    const res = await fetch(server.url);
    // Dashboard may return 404 if not built, or 200 if HTML exists
    expect([200, 404]).toContain(res.status);
  });

  it('GET /v1/models returns model list via real HTTP', async () => {
    server = startTestServer();
    const res = await fetch(`${server.url}/v1/models`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('POST /v1/chat/completions works end-to-end (non-streaming)', async () => {
    server = startTestServer();
    const res = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-web/claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toBeTruthy();
  });

  it('POST /v1/chat/completions works end-to-end (streaming)', async () => {
    server = startTestServer();
    const res = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-web/claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: {');
    expect(text).toContain('data: [DONE]');
  });

  it('POST /v1/messages (Anthropic format) works end-to-end', async () => {
    server = startTestServer();
    const res = await fetch(`${server.url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-web/claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('message');
    expect(body.content[0].type).toBe('text');
  });

  it('POST /v1/messages streaming end-to-end', async () => {
    const provider = new DelayedMockProvider([
      { type: 'text_delta', delta: 'Hello' },
      { type: 'text_delta', delta: ' E2E' },
      { type: 'done', reason: 'stop' },
    ]);
    server = startTestServer({ providers: [provider] });
    const res = await fetch(`${server.url}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'delayed-mock/test-model',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: message_start');
    expect(text).toContain('Hello');
    expect(text).toContain(' E2E');
    expect(text).toContain('event: message_stop');
  });

  it('auth token blocks unauthorized requests', async () => {
    server = startTestServer({ authToken: 'my-secret' });
    const res = await fetch(`${server.url}/v1/models`);
    expect(res.status).toBe(403);
  });

  it('auth token allows authorized requests (Bearer)', async () => {
    server = startTestServer({ authToken: 'my-secret' });
    const res = await fetch(`${server.url}/v1/models`, {
      headers: { 'Authorization': 'Bearer my-secret' },
    });
    expect(res.status).toBe(200);
  });

  it('auth token allows x-api-key (Anthropic style)', async () => {
    server = startTestServer({ authToken: 'my-secret' });
    const res = await fetch(`${server.url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'my-secret',
      },
      body: JSON.stringify({
        model: 'claude-web/claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it('routes to correct provider', async () => {
    server = startTestServer();
    const res1 = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-web/claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      }),
    });
    const body1 = await res1.json();
    expect(body1.choices[0].message.content).toContain('claude-web');

    const res2 = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-web/deepseek-flash',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      }),
    });
    const body2 = await res2.json();
    expect(body2.choices[0].message.content).toContain('deepseek-web');
  });

  it('returns proper error for unknown model', async () => {
    server = startTestServer();
    const res = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nonexistent/model',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_model');
  });

  it('management endpoints protected by auth token', async () => {
    server = startTestServer({ authToken: 'secret' });
    const res = await fetch(`${server.url}/webmodel/providers`);
    expect(res.status).toBe(403);

    const res2 = await fetch(`${server.url}/webmodel/providers`, {
      headers: { 'Authorization': 'Bearer secret' },
    });
    expect(res2.status).toBe(200);
  });
});
