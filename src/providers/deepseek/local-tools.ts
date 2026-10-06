import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, copyFileSync, renameSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Local tool proxy for the DeepSeek web provider.
 *
 * The web model cannot do real function calling, so it emits a text tool call
 * (JSON wrapped in <dsml-tool> tags) and this module executes it against the
 * local machine. Tools are deliberately broad (the user reviews execution), but
 * a few hard guards remain: absolute paths only, no deleting drive roots /
 * system dirs, command output is truncated.
 */

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

const TOOL_WHITELIST = new Set([
  'list_directory', 'read_file', 'write_file', 'edit_file',
  'run_command', 'delete_file', 'copy_file', 'move_file', 'create_directory',
]);
const MAX_WRITE_BYTES = 512 * 1024; // refuse writing files larger than this
const MAX_READ_BYTES = 1024 * 1024; // refuse reading files larger than this
const MAX_OUTPUT_BYTES = 32 * 1024; // truncate command / listing output
const COMMAND_TIMEOUT_MS = 120_000;
const PROTECTED_PREFIXES = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'];

/** Extract a tool call from a model reply. Accepts several shapes. */
export function parseToolCall(text: string): ToolCall | null {
  if (!text) return null;

  // Preferred: <dsml-tool>{"tool":"read_file","path":"..."}</dsml-tool>
  const tagMatch = text.match(/<dsml-tool>([\s\S]*?)<\/dsml-tool>/i);
  let candidate = tagMatch ? tagMatch[1] : text;

  // Fallback: ```json ... ``` fenced block
  const blockMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (blockMatch) candidate = blockMatch[1];

  // Take the first JSON object in the candidate text
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const tool = parsed.tool ?? parsed.name ?? parsed.function?.name;
  if (typeof tool !== 'string' || !TOOL_WHITELIST.has(tool)) return null;

  const args = parsed.args ?? parsed.arguments ?? parsed;
  if (typeof args !== 'object' || args === null) return null;

  return { tool, args };
}

/** Execute a tool call locally. Never throws; returns text output for the model. */
export function executeTool(call: ToolCall): string {
  const { tool, args } = call;

  try {
    switch (tool) {
      case 'list_directory': {
        const path = requireAbsPath(args.path, '目录路径');
        if (!existsSync(path)) return `目录不存在: ${path}`;
        const st = statSync(path);
        if (!st.isDirectory()) return `不是目录: ${path}`;
        const entries = readdirSync(path);
        const lines = entries.map((name) => {
          const full = join(path, name);
          let kind = 'file';
          try {
            kind = statSync(full).isDirectory() ? 'dir' : 'file';
          } catch { /* ignore */ }
          return `${kind}\t${name}`;
        });
        const out = `目录 ${path} 共 ${entries.length} 项:\n${lines.join('\n')}`;
        return truncate(out);
      }

      case 'read_file': {
        const path = requireAbsPath(args.path, '文件路径');
        if (!existsSync(path)) return `文件不存在: ${path}`;
        const st = statSync(path);
        if (st.isDirectory()) return `是目录不是文件: ${path}`;
        if (st.size > MAX_READ_BYTES) return `文件过大(${st.size} 字节)，拒绝读取: ${path}`;
        const content = readFileSync(path, 'utf-8');
        return truncate(content.length > 0 ? content : '(空文件)');
      }

      case 'write_file': {
        const path = requireAbsPath(args.path, '文件路径');
        const content = typeof args.content === 'string' ? args.content : '';
        if (content.length > MAX_WRITE_BYTES) return `内容过大(${content.length} 字符)，拒绝写入`;
        const dir = path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')));
        if (dir && !existsSync(dir)) {
          try {
            mkdirSync(dir, { recursive: true });
          } catch (e: any) {
            return `无法创建目录: ${(e as Error).message}`;
          }
        }
        writeFileSync(path, content, 'utf-8');
        return `已写入 ${path} (${Buffer.byteLength(content, 'utf-8')} 字节)`;
      }

      case 'edit_file': {
        const path = requireAbsPath(args.path, '文件路径');
        if (!existsSync(path)) return `文件不存在: ${path}`;
        const oldText = typeof args.old === 'string' ? args.old : '';
        const newText = typeof args.new === 'string' ? args.new : '';
        if (!oldText) return 'edit_file 缺少 old 参数';
        const current = readFileSync(path, 'utf-8');
        if (!current.includes(oldText)) return `在 ${path} 中未找到要替换的文本`;
        const updated = current.replace(oldText, newText);
        writeFileSync(path, updated, 'utf-8');
        return `已更新 ${path}`;
      }

      case 'create_directory': {
        const path = requireAbsPath(args.path, '目录路径');
        mkdirSync(path, { recursive: true });
        return `已创建目录: ${path}`;
      }

      case 'copy_file': {
        const src = requireAbsPath(args.source ?? args.src ?? args.path, '源路径');
        const dst = requireAbsPath(args.destination ?? args.dest ?? args.target, '目标路径');
        if (!existsSync(src)) return `源不存在: ${src}`;
        copyFileSync(src, dst);
        return `已复制 ${src} → ${dst}`;
      }

      case 'move_file': {
        const src = requireAbsPath(args.source ?? args.src ?? args.path, '源路径');
        const dst = requireAbsPath(args.destination ?? args.dest ?? args.target, '目标路径');
        if (!existsSync(src)) return `源不存在: ${src}`;
        renameSync(src, dst);
        return `已移动 ${src} → ${dst}`;
      }

      case 'delete_file': {
        const path = requireAbsPath(args.path, '路径');
        if (!existsSync(path)) return `路径不存在: ${path}`;
        for (const p of PROTECTED_PREFIXES) {
          if (path.toUpperCase().startsWith(p.toUpperCase())) return `受保护路径，拒绝删除: ${path}`;
        }
        if (path === 'C:\\' || path === 'D:\\' || path === 'E:\\' || path === 'C:/' || path === 'D:/' || path === 'E:/') {
          return '拒绝删除盘符根目录';
        }
        rmSync(path, { recursive: true, force: true });
        return `已删除: ${path}`;
      }

      case 'run_command': {
        const command = typeof args.command === 'string' ? args.command.trim() : '';
        if (!command) return 'run_command 缺少 command 参数';
        if (command.length > 8000) return `命令过长(${command.length} 字符)，拒绝执行`;
        let stdout = '';
        try {
          const child = execSync(`pwsh -NoProfile -NonInteractive -Command "${command.replace(/"/g, '\\"')}"`, {
            encoding: 'utf-8',
            timeout: COMMAND_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: MAX_OUTPUT_BYTES * 2,
          });
          stdout = String(child ?? '');
        } catch (e: any) {
          const err = e as any;
          stdout = err?.stdout ? String(err.stdout) : '';
          const stderr = err?.stderr ? String(err.stderr) : '';
          return truncate(`命令执行失败 (exit ${err?.status ?? '?'}):\n${stderr}\n${stdout}`);
        }
        return truncate(stdout.length > 0 ? stdout : '(命令执行成功，无输出)');
      }

      default:
        return `未知工具: ${tool}`;
    }
  } catch (e: any) {
    return `工具执行错误: ${(e as Error).message}`;
  }
}

/** Build the tool instruction block injected into the model prompt. */
export function buildLocalToolPrompt(): string {
  return [
    '[本地工具]',
    '你可以调用以下工具操作本机文件或执行命令。需要调用时，单独输出一行（不要夹在其他文字里）：',
    '<dsml-tool>{"tool":"工具名","args":{...}}</dsml-tool>',
    '',
    '可用工具:',
    '- list_directory: 列出目录内容。args: {"path":"绝对路径"}',
    '- read_file: 读取文本文件。args: {"path":"绝对路径"}',
    '- write_file: 写入/覆盖文件。args: {"path":"绝对路径","content":"内容"}',
    '- edit_file: 替换文件中的一段文本。args: {"path":"绝对路径","old":"原文","new":"新文"}',
    '- create_directory: 创建目录。args: {"path":"绝对路径"}',
    '- copy_file: 复制文件。args: {"source":"源","destination":"目标"}',
    '- move_file: 移动/重命名文件。args: {"source":"源","destination":"目标"}',
    '- delete_file: 删除文件或目录。args: {"path":"绝对路径"}',
    '- run_command: 执行 PowerShell 命令。args: {"command":"命令"}',
    '',
    '规则:',
    '- 路径必须是绝对路径（如 C:\\... 或 E:\\...）。',
    '- 一次只调用一个工具；工具结果会作为下一条消息返回给你。',
    '- 需要多次工具调用时，等上一次结果返回后再调用下一个。',
    '- 全部完成后，用正常文字回答用户。',
  ].join('\n');
}

function requireAbsPath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少${label}参数`);
  const p = value.trim();
  // Normalize forward slashes for Windows path checks
  const normalized = p.replace(/\//g, '\\');
  if (!isAbsolute(normalized)) throw new Error(`${label}必须是绝对路径: ${p}`);
  return normalized;
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text;
  return text.slice(0, MAX_OUTPUT_BYTES) + `\n…(输出过长，已截断，共 ${text.length} 字符)`;
}
