import { BaseProvider, type ProviderInfo, type ModelInfo, type ChatRequest, buildWebPrompt } from '../../core/provider.js';
import type { StreamEvent } from '../../core/stream.js';

import { solvePow, buildPowResponse, type DeepSeekPowChallenge } from './pow.js';
import { DEEPSEEK_WEB_BASE_URL } from './client.js';
import { AuthStore } from '../../auth/store.js';
import { parseToolCall, executeTool, buildLocalToolPrompt } from './local-tools.js';
import { extractImages, downloadRemoteImage, type UploadImage } from './upload.js';
import type { Page } from 'playwright-core';

/** A live DeepSeek web chat session, keyed by logical conversation. */
interface DeepSeekChatSession {
  sessionId: string;
  /** Last assistant message id in this session, used as the parent for the next turn. */
  lastResponseMessageId: number | null;
}

export class DeepSeekProvider extends BaseProvider {
  readonly info: ProviderInfo = {
    id: 'deepseek-web',
    name: 'DeepSeek Web',
    website: DEEPSEEK_WEB_BASE_URL,
    loginUrl: `${DEEPSEEK_WEB_BASE_URL}/sign_in`,
    needsBrowser: true,
  };

  private bearerToken: string | null = null;

  /** Logical conversation key → live DeepSeek web session (reuse across turns). */
  private sessions = new Map<string, DeepSeekChatSession>();
  /** Serialization queue: the provider shares one browser page, so chat
   *  requests must run one at a time to avoid interleaving sessions. */
  private queueTail: Promise<void> = Promise.resolve();

  constructor(
    private authStore: AuthStore,
    _browserFetch?: (url: string, init: RequestInit) => Promise<Response>,
    private getPage?: (origin: string) => Promise<Page>,
  ) {
    super();
  }

  /** Set a bearer token for API authentication (e.g. from OpenClaw auth-profiles) */
  setBearerToken(token: string): void {
    this.bearerToken = token;
  }

  async login(context: { openUrl: (url: string) => Promise<void> }): Promise<void> {
    await context.openUrl(this.info.loginUrl);
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authStore.getStatus(this.info.id).status === 'active';
  }

  async detectLoginComplete(): Promise<boolean> {
    return false;
  }

  async models(): Promise<ModelInfo[]> {
    return [
      { id: 'deepseek-flash', name: 'DeepSeek Flash', contextWindow: 1000000, maxOutput: 384000 },
      { id: 'deepseek-flash-reasoner', name: 'DeepSeek Flash Reasoner', contextWindow: 1000000, maxOutput: 384000 },
    ];
  }

  async *chat(req: ChatRequest): AsyncIterable<StreamEvent> {
    // Serialize all requests: concurrent page.evaluate() calls on the shared
    // page would interleave session creation and SSE reads, scattering
    // messages across conversations.
    const prev = this.queueTail;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    this.queueTail = prev.then(() => gate, () => gate);
    await prev;
    try {
      yield* this.doChat(req);
    } finally {
      release();
    }
  }

  private async *doChat(req: ChatRequest): AsyncIterable<StreamEvent> {
    if (!this.getPage) {
      yield { type: 'error', message: 'Browser not connected' };
      return;
    }

    try {
      const page = await this.getPage(DEEPSEEK_WEB_BASE_URL);

      // Step 1: Extract bearer token
      // DeepSeek stores JWT in a cookie named "ds_chat_token" or via login response.
      // Strategy: try /api/v0/users/current with cookies → intercept from page.
      let bearer = this.bearerToken;
      if (!bearer) {
        // Primary method: Intercept request headers by reloading the page.
        // DeepSeek's frontend JS adds the Authorization header from its own state.
        const tokenPromise = new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 10000);
          const handler = (request: any) => {
            const url = request.url() as string;
            if (url.includes('/api/v0/')) {
              const auth = request.headers()['authorization'] as string | undefined;
              if (auth?.startsWith('Bearer ')) {
                clearTimeout(timeout);
                page.off('request', handler);
                resolve(auth.slice(7));
              }
            }
          };
          page.on('request', handler);
        });
        // Reload the page — DeepSeek frontend will fire API calls with Bearer token
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => {});
        bearer = await tokenPromise;
      }
      if (!bearer) {
        yield { type: 'error', message: 'DeepSeek: could not extract bearer token. Please re-login at chat.deepseek.com' };
        return;
      }

      // Step 2: Reuse the live DeepSeek session for this logical conversation,
      // or create a new one. Without reuse every API request spawns a brand-new
      // chat on deepseek.com and messages scatter across conversations.
      const sessionKey = req.user || 'default';
      let chatSession = this.sessions.get(sessionKey);
      let sessionResult: { sessionId?: string; error?: string } = {};

      if (!chatSession) {
        sessionResult = await page.evaluate(async (bearerToken: string | null) => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
            const res = await fetch('/api/v0/chat_session/create', {
              method: 'POST',
              headers,
              body: '{}',
              credentials: 'include',
            });
            if (!res.ok) {
              const text = await res.text();
              return { error: `HTTP ${res.status}: ${text.substring(0, 200)}` };
            }
            const data = await res.json();
            return { sessionId: data?.data?.biz_data?.id || data?.data?.id };
          } catch (e: any) {
            return { error: e.message };
          }
        }, bearer);

        if (sessionResult.error || !sessionResult.sessionId) {
          yield { type: 'error', message: `DeepSeek session create failed: ${sessionResult.error || 'no session id'}` };
          return;
        }
        chatSession = { sessionId: sessionResult.sessionId, lastResponseMessageId: null };
        this.sessions.set(sessionKey, chatSession);
      }

      // Step 3+4: PoW challenge & solve now happen per round inside sendCompletion.

      // Step 5: Build prompt — inject local tool instructions plus the
      // client's own tool definitions as text (no native function calling).
      const isThinking = req.model.includes('reasoner');
      let prompt = buildWebPrompt(req.messages);
      // Inject tool definitions only on the FIRST turn of each logical
      // session. On later turns the model still sees them in the DeepSeek
      // conversation context; resending every turn wastes tokens and makes
      // the traffic look more bot-like. A freshly (re)created session has no
      // parent message yet and therefore counts as the first turn.
      const isFirstTurn = chatSession.lastResponseMessageId === null;
      if (req.tools && req.tools.length > 0 && isFirstTurn) {
        const toolLines = req.tools.map((t, i) => {
          const fn = t.function;
          const params = fn.parameters ? JSON.stringify(fn.parameters) : '{}';
          return `${i + 1}. ${fn.name} — ${fn.description || ''} 参数: ${params}`;
        });
        prompt = `${buildLocalToolPrompt()}\n\n[客户端工具]\n${toolLines.join('\n')}\n\n${prompt}`;
      }

      // Step 5.5: Extract images from the request and upload them to the web
      // API so the model can see them (referenced via ref_file_ids).
      let refFileIds: string[] = [];
      const images = extractImages(req.messages);
      if (images.length > 0) {
        let ready: UploadImage[] = [];
        try {
          ready = await Promise.all(images.map(downloadRemoteImage));
        } catch (e: any) {
          yield { type: 'error', message: (e as Error).message };
          return;
        }
        const up = await this.uploadImageFiles(page, bearer, ready);
        if (up.error) {
          yield { type: 'error', message: up.error };
          return;
        }
        refFileIds = up.ids;
        if (refFileIds.length === 0) {
          yield { type: 'error', message: '图片上传失败：未获得文件 ID' };
          return;
        }
      }

      // Step 6: Tool loop — send the prompt; if the model asks for a local
      // tool, execute it locally and feed the result back until the model
      // answers the user with normal text. Round cap is generous (configurable
      // via WMB_MAX_TOOL_ROUNDS); the loop only exists to bound runaway loops.
      const MAX_LOCAL_TOOL_ROUNDS = Number(process.env.WMB_MAX_TOOL_ROUNDS) || 50;
      let finalText = '';
      for (let round = 0; round < MAX_LOCAL_TOOL_ROUNDS; round++) {
        const res = await this.sendCompletion(page, chatSession, prompt, bearer, isThinking, refFileIds);
        if (!res.ok) {
          // Session may have expired on DeepSeek's side — drop it so the next
          // request starts fresh instead of failing forever.
          this.sessions.delete(sessionKey);
          yield { type: 'error', message: res.error ?? 'DeepSeek API error' };
          return;
        }

        const call = parseToolCall(res.text);
        if (!call) {
          finalText = res.text;
          break;
        }

        const output = executeTool(call);
        prompt = `工具 ${call.tool} 已执行，结果如下：\n${output}\n\n请根据结果继续处理，完成用户请求后用正常文字回答，不要再输出工具调用。`;
      }

      if (finalText) {
        yield { type: 'text_delta', delta: finalText };
      } else {
        yield { type: 'text_delta', delta: '（模型未返回最终回复）' };
      }
      yield { type: 'done', reason: 'stop' };

    } catch (err) {
      yield { type: 'error', message: `DeepSeek provider error: ${(err as Error).message}` };
    }
  }

  /**
   * One completion round: fetch a fresh PoW, send the prompt to the DeepSeek
   * web API, parse the SSE and return the aggregated assistant text, while
   * updating the session chain (parent message id).
   */
  private async sendCompletion(
    page: Page,
    chatSession: DeepSeekChatSession,
    prompt: string,
    bearer: string,
    isThinking: boolean,
    refFileIds: string[] = [],
  ): Promise<{ ok: boolean; text: string; thinkText?: string; error?: string }> {
    // PoW per round
    let powResponse: string;
    try {
      const challengeResult = await page.evaluate(async (bearerToken: string | null) => {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
          const res = await fetch('/api/v0/chat/create_pow_challenge', {
            method: 'POST',
            headers,
            body: JSON.stringify({ target_path: '/api/v0/chat/completion' }),
            credentials: 'include',
          });
          if (!res.ok) return { error: `HTTP ${res.status}` };
          const data = await res.json();
          const c = data?.data?.biz_data?.challenge || data?.data?.challenge || data?.challenge;
          return { challenge: c };
        } catch (e: any) {
          return { error: e.message };
        }
      }, bearer);
      if (challengeResult.error || !challengeResult.challenge) {
        return { ok: false, text: '', error: `DeepSeek PoW challenge failed: ${challengeResult.error || 'no challenge'}` };
      }
      const challenge = challengeResult.challenge as DeepSeekPowChallenge;
      const answer = await solvePow(challenge);
      powResponse = buildPowResponse(challenge, answer, '/api/v0/chat/completion');
    } catch (err) {
      return { ok: false, text: '', error: `DeepSeek PoW solve failed: ${(err as Error).message}` };
    }

    const sseResult = await page.evaluate(async (args: {
      sessionId: string; prompt: string; powResponse: string; thinkingEnabled: boolean; bearerToken: string | null;
      parentMessageId: number | null; refFileIds: string[];
    }) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-ds-pow-response': args.powResponse,
        };
        if (args.bearerToken) headers['Authorization'] = `Bearer ${args.bearerToken}`;
        const res = await fetch('/api/v0/chat/completion', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chat_session_id: args.sessionId,
            parent_message_id: args.parentMessageId,
            prompt: args.prompt,
            ref_file_ids: args.refFileIds,
            thinking_enabled: args.thinkingEnabled,
            search_enabled: false,
            preempt: false,
          }),
          credentials: 'include',
        });

        if (!res.ok) {
          const text = await res.text();
          return { error: `HTTP ${res.status}: ${text.substring(0, 200)}` };
        }

        const reader = res.body?.getReader();
        if (!reader) return { error: 'No response body' };

        // Parse DeepSeek's JSON-patch SSE in-page. Fragments arrive as a
        // snapshot or APPEND array (each has id + type: THINK | RESPONSE),
        // then content deltas target "response/fragments/-1/content" where
        // -1 is the *current last* fragment. We must track per-fragment type,
        // otherwise thinking deltas and answer deltas (same path) get merged.
        const decoder = new TextDecoder();
        let buf = '';
        const frags = new Map<number, { type: string; content: string }>();
        const idOrder: number[] = [];
        let lastFragId: number | null = null;
        let lastPath = '';
        let responseMsgId: number | null = null;

        const handleData = (dataStr: string) => {
          const body = dataStr.trim();
          if (!body || body === '{}' || body === '[DONE]') return;
          let j: any;
          try { j = JSON.parse(body); } catch { return; }

          // "ready" payload: request/response message ids
          if (j.request_message_id != null && j.response_message_id != null) {
            responseMsgId = j.response_message_id;
            return;
          }

          // Full response snapshot
          if (j?.v?.response) {
            const r = j.v.response;
            if (r.message_id != null) responseMsgId = r.message_id;
            for (const f of (r.fragments || [])) {
              if (!frags.has(f.id)) { frags.set(f.id, { type: f.type, content: '' }); idOrder.push(f.id); }
              const fr = frags.get(f.id)!;
              fr.type = f.type;
              if (typeof f.content === 'string') fr.content = f.content;
              lastFragId = f.id;
            }
            return;
          }

          // New fragments appended as an array
          if (j.p === 'response/fragments' && j.o === 'APPEND' && Array.isArray(j.v)) {
            for (const f of j.v) {
              if (!frags.has(f.id)) {
                frags.set(f.id, { type: f.type, content: typeof f.content === 'string' ? f.content : '' });
                idOrder.push(f.id);
              }
              lastFragId = f.id;
            }
            return;
          }

          // Content deltas: path explicit or carried from the previous event
          const path: string = j.p ?? lastPath;
          if (j.p) lastPath = j.p;
          const m = /^response\/fragments\/(-1|\d+)\/content$/.exec(path);
          if (m && typeof j.v === 'string') {
            const id = m[1] === '-1' ? lastFragId : idOrder[Number(m[1])];
            if (id != null && frags.has(id)) {
              const fr = frags.get(id)!;
              if (j.o === 'SET') fr.content = j.v;
              else fr.content += j.v;
            }
          }
        };

        const consumeFrame = (frame: string) => {
          const norm = frame.replace(/\r\n/g, '\n');
          const dataLines = norm.split('\n')
            .filter(l => l.startsWith('data:'))
            .map(l => l.slice(5).replace(/^ /, ''));
          if (dataLines.length) handleData(dataLines.join('\n'));
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            consumeFrame(buf.slice(0, idx));
            buf = buf.slice(idx + 2);
          }
        }
        if (buf.trim()) consumeFrame(buf);

        const join = (ty: string) =>
          idOrder.filter(id => frags.get(id)!.type === ty).map(id => frags.get(id)!.content).join('');
        return {
          parsed: {
            responseText: join('RESPONSE'),
            thinkText: join('THINK'),
            responseMsgId,
          },
        };
      } catch (e: any) {
        return { error: e.message };
      }
    }, {
      sessionId: chatSession.sessionId,
      prompt,
      powResponse,
      thinkingEnabled: isThinking,
      bearerToken: bearer,
      parentMessageId: chatSession.lastResponseMessageId,
      refFileIds,
    });

    if (sseResult.error) {
      return { ok: false, text: '', error: `DeepSeek API error: ${sseResult.error}` };
    }

    // The in-page parser already separated THINK fragments from RESPONSE
    // fragments and tracked the message-id chain.
    const parsed = sseResult.parsed as
      | { responseText: string; thinkText: string; responseMsgId: number | null }
      | undefined;
    if (!parsed) {
      return { ok: false, text: '', error: 'DeepSeek: failed to parse completion SSE' };
    }
    if (parsed.responseMsgId != null) {
      chatSession.lastResponseMessageId = parsed.responseMsgId;
    }
    return { ok: true, text: parsed.responseText, thinkText: parsed.thinkText };
  }

  /** Upload images to the DeepSeek web API and return their file ids. */
  private async uploadImageFiles(
    page: Page,
    bearer: string,
    images: UploadImage[],
  ): Promise<{ ids: string[]; error?: string }> {
    const ids: string[] = [];
    for (const img of images) {
      try {
        // PoW for the upload endpoint (target_path differs from completion)
        const challengeResult = await page.evaluate(async (bearerToken: string | null) => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
            const res = await fetch('/api/v0/chat/create_pow_challenge', {
              method: 'POST',
              headers,
              body: JSON.stringify({ target_path: '/api/v0/file/upload_file' }),
              credentials: 'include',
            });
            if (!res.ok) return { error: `HTTP ${res.status}` };
            const data = await res.json();
            const c = data?.data?.biz_data?.challenge || data?.data?.challenge || data?.challenge;
            return { challenge: c };
          } catch (e: any) {
            return { error: e.message };
          }
        }, bearer);
        if (challengeResult.error || !challengeResult.challenge) {
          return { ids, error: `上传 PoW 失败: ${challengeResult.error || 'no challenge'}` };
        }
        const challenge = challengeResult.challenge as DeepSeekPowChallenge;
        const answer = await solvePow(challenge);
        const powResponse = buildPowResponse(challenge, answer, '/api/v0/file/upload_file');

        const up = await page.evaluate(async (args: {
          base64: string; mime: string; filename: string; powResponse: string; bearerToken: string | null;
        }) => {
          try {
            const binary = atob(args.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = new File([bytes], args.filename, { type: args.mime });
            const fd = new FormData();
            fd.append('file', file);
            const headers: Record<string, string> = { 'x-ds-pow-response': args.powResponse };
            if (args.bearerToken) headers['Authorization'] = `Bearer ${args.bearerToken}`;
            const res = await fetch('/api/v0/file/upload_file', {
              method: 'POST',
              headers,
              body: fd,
              credentials: 'include',
            });
            const text = await res.text();
            return { status: res.status, body: text };
          } catch (e: any) {
            return { error: e.message };
          }
        }, {
          base64: img.base64,
          mime: img.mime || 'image/png',
          filename: img.filename,
          powResponse,
          bearerToken: bearer,
        });

        if (up.error) return { ids, error: `上传请求失败: ${up.error}` };
        if (up.status !== 200) return { ids, error: `上传失败 HTTP ${up.status}: ${String(up.body ?? '').substring(0, 200)}` };

        // Parse the file id from the upload response (several shapes).
        let parsed: any = null;
        try { parsed = JSON.parse(up.body ?? ''); } catch { /* not json */ }
        const id = parsed?.data?.biz_data?.id ?? parsed?.data?.data?.id ?? parsed?.data?.id ?? parsed?.biz_data?.id ?? parsed?.id;
        if (typeof id !== 'string' || !id) {
          return { ids, error: `上传响应中未找到文件 ID: ${String(up.body ?? '').substring(0, 300)}` };
        }
        ids.push(id);
        // The file starts in PENDING/PARSING; the web API rejects ref ids that
        // are not parsed yet ("invalid ref file id"), so wait until it is ready.
        try {
          await this.waitFileReady(page, bearer, id);
        } catch (e: any) {
          return { ids, error: (e as Error).message };
        }
      } catch (e: any) {
        return { ids, error: `图片上传失败: ${(e as Error).message}` };
      }
    }
    return { ids };
  }

  /**
   * Poll the web API until an uploaded file finishes parsing (PENDING/PARSING
   * → SUCCESS). The completion endpoint rejects not-yet-ready ref file ids.
   */
  private async waitFileReady(page: Page, bearer: string, fileId: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    let lastStatus = 'unknown';
    while (Date.now() < deadline) {
      const res = await page.evaluate(async (args: { fileId: string; bearerToken: string | null }) => {
        try {
          const headers: Record<string, string> = {};
          if (args.bearerToken) headers['Authorization'] = `Bearer ${args.bearerToken}`;
          const url = `/api/v0/file/fetch_files?file_ids=${encodeURIComponent(args.fileId)}`;
          const r = await fetch(url, { headers, credentials: 'include' });
          const text = await r.text();
          return { status: r.status, body: text };
        } catch (e: any) {
          return { error: e.message };
        }
      }, { fileId, bearerToken: bearer });

      if (res.error) throw new Error(`查询文件状态失败: ${res.error}`);

      let parsed: any = null;
      try { parsed = JSON.parse(res.body ?? ''); } catch { /* not json */ }
      const bizCode = parsed?.data?.biz_code;
      if (bizCode !== 0) throw new Error(`查询文件状态失败 biz_code=${bizCode}: ${parsed?.data?.biz_msg}`);

      const files = parsed?.data?.biz_data?.files;
      const f = Array.isArray(files) ? files.find((x: any) => x?.id === fileId) : undefined;
      const status: string = f?.status ?? f?.parse_status ?? '';
      if (status) lastStatus = status;

      if (status === 'SUCCESS' || status === 'READY' || /success/i.test(status)) return;
      if (/fail|error/i.test(status)) {
        throw new Error(`文件解析失败: status=${status}`);
      }
      // PENDING / PARSING / unknown → keep polling
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error(`等待文件解析超时(30s)，最后状态: ${lastStatus}`);
  }
}
