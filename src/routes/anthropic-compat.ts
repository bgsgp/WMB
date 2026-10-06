import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { ProviderRegistry } from '../core/registry.js';
import {
  formatAnthropicNonStream,
  formatMessageStart,
  formatContentBlockStart,
  formatContentBlockDelta,
  formatContentBlockStop,
  formatMessageDelta,
  formatMessageStop,
  formatPing,
  streamEventToStopReason,
} from '../core/anthropic-formatter.js';
import { AuthRequiredError, InvalidBodyError, errorToHttpResponse } from '../core/errors.js';
import type { Message } from '../core/provider.js';

export function anthropicRoutes(registry: ProviderRegistry): Hono {
  const app = new Hono();

  app.post('/v1/messages', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      const res = errorToHttpResponse(new InvalidBodyError('invalid JSON'));
      return c.json(res.body, res.status as any);
    }

    if (!body.model || typeof body.model !== 'string') {
      const res = errorToHttpResponse(new InvalidBodyError('missing model field'));
      return c.json(res.body, res.status as any);
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      const res = errorToHttpResponse(new InvalidBodyError('missing messages field'));
      return c.json(res.body, res.status as any);
    }

    // Resolve provider from model ID
    let resolved;
    try {
      resolved = await registry.resolve(body.model);
    } catch (err) {
      const res = errorToHttpResponse(err as Error);
      return c.json(res.body, res.status as any);
    }

    const { provider, model } = resolved;

    if (!(await provider.isAuthenticated())) {
      const res = errorToHttpResponse(new AuthRequiredError(provider.info.id));
      return c.json(res.body, res.status as any);
    }

    // Convert Anthropic messages to internal format
    const messages: Message[] = [];
    if (body.system) {
      const systemText = typeof body.system === 'string'
        ? body.system
        : Array.isArray(body.system)
          ? body.system.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
          : '';
      if (systemText) {
        messages.push({ role: 'system', content: systemText });
      }
    }
    for (const msg of body.messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('')
          : '';
      messages.push({ role: msg.role, content });
    }

    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isStream = body.stream === true;

    if (isStream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      return stream(c, async (s) => {
        await s.write(formatMessageStart(msgId, body.model));
        await s.write(formatPing());
        await s.write(formatContentBlockStart(0));

        // SSE-comment heartbeat: the provider aggregates the whole upstream
        // turn (web reasoner can think for minutes) without any event; keep
        // the connection alive so clients don't time out mid-thinking.
        const heartbeat = setInterval(() => {
          s.write(`: keepalive\n\n`).catch(() => {});
        }, 10_000);

        let stopReason = 'end_turn';
        try {
          for await (const event of provider.chat({ model, messages, stream: true })) {
            if (event.type === 'text_delta') {
              await s.write(formatContentBlockDelta(0, event.delta));
            } else if (event.type === 'thinking_delta') {
              await s.write(formatContentBlockDelta(0, event.delta));
            } else if (event.type === 'done') {
              stopReason = streamEventToStopReason(event) ?? 'end_turn';
            } else if (event.type === 'error') {
              await s.write(formatContentBlockDelta(0, `\n\nError: ${event.message}`));
            }
          }
        } catch (err) {
          await s.write(formatContentBlockDelta(0, `\n\nError: ${(err as Error).message}`));
        } finally {
          clearInterval(heartbeat);
        }

        await s.write(formatContentBlockStop(0));
        await s.write(formatMessageDelta(stopReason));
        await s.write(formatMessageStop());
      });
    }

    // Non-streaming
    let fullContent = '';
    let lastError: string | null = null;
    for await (const event of provider.chat({ model, messages, stream: false })) {
      if (event.type === 'text_delta') {
        fullContent += event.delta;
      } else if (event.type === 'error') {
        lastError = event.message;
      }
    }
    if (fullContent.length === 0 && lastError) {
      return c.json({
        type: 'error',
        error: { type: 'api_error', message: lastError },
      }, 502 as any);
    }
    return c.json(formatAnthropicNonStream(msgId, body.model, fullContent));
  });

  return app;
}
