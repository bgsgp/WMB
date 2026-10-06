import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { ProviderRegistry } from '../core/registry.js';
import {
  formatStreamChunk,
  formatDoneChunk,
  formatNonStreamResponse,
  formatModelsResponse,
} from '../core/openai-formatter.js';
import { AuthRequiredError, InvalidBodyError, errorToHttpResponse } from '../core/errors.js';
import type { Message } from '../core/provider.js';

export function openaiRoutes(registry: ProviderRegistry): Hono {
  const app = new Hono();

  app.post('/v1/chat/completions', async (c) => {
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

    const runId = `wmb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const messages: Message[] = body.messages;
    const isStream = body.stream === true;

    if (isStream) {
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');

      return stream(c, async (s) => {
        let isFirst = true;
        // Emit an SSE comment immediately, then every 10s while the provider
        // is silent. Web providers aggregate the whole upstream turn inside
        // one page.evaluate call (reasoner can think for minutes); without a
        // heartbeat the client times out on an idle connection and reports
        // "Stream ended without finish_reason". Comment lines (": ...") are
        // ignored by SSE parsers but reset every intermediary timeout.
        await s.write(`: connected ${runId}\n\n`);
        const heartbeat = setInterval(() => {
          s.write(`: keepalive\n\n`).catch(() => {});
        }, 10_000);
        try {
          for await (const event of provider.chat({ model, messages, stream: true, user: body.user, tools: body.tools })) {
            const chunk = formatStreamChunk(runId, body.model, event, isFirst);
            await s.write(`data: ${JSON.stringify(chunk)}\n\n`);
            isFirst = false;
          }
          await s.write(`data: ${formatDoneChunk()}\n\n`);
        } catch (err) {
          // Surface the error in-band AND terminate with a finish_reason so
          // strict clients never see the stream end without one.
          const errChunk = {
            id: runId,
            object: 'chat.completion.chunk' as const,
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [{
              index: 0,
              delta: { content: `\n[bridge error: ${(err as Error).message}]` },
              finish_reason: 'stop' as const,
            }],
          };
          await s.write(`data: ${JSON.stringify(errChunk)}\n\n`);
          await s.write(`data: ${formatDoneChunk()}\n\n`);
        } finally {
          clearInterval(heartbeat);
        }
      });
    }

    // Non-streaming
    let fullContent = '';
    let lastError: string | null = null;
    for await (const event of provider.chat({ model, messages, stream: false, user: body.user, tools: body.tools })) {
      if (event.type === 'text_delta') {
        fullContent += event.delta;
      } else if (event.type === 'error') {
        lastError = event.message;
      }
    }
    if (fullContent.length === 0 && lastError) {
      return c.json({
        error: { message: lastError, type: 'provider_error', code: 'provider_error' },
      }, 502 as any);
    }
    return c.json(formatNonStreamResponse(runId, body.model, fullContent));
  });

  app.get('/v1/models', async (c) => {
    const models = await registry.allModels();
    return c.json(formatModelsResponse(models));
  });

  return app;
}
