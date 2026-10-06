// extract-dsh-tools.mjs — DSH tool schema extractor (DSH-exclusive tools, NOT part of WMB runtime).
// Usage: node extract-dsh-tools.mjs <asar-or-unpacked-dir> <output-md> [<output-json>]
// Unpacks app.asar on demand, imports every @deepseek-ai/dsh-tool-* package with a stubbed ctx,
// and writes a zero-collapse markdown doc of all tool schemas.
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [src, outDir, outJsonArg] = process.argv.slice(2);
if (!src) {
  console.error("Usage: node extract-dsh-tools.mjs <asar-or-unpacked-dir> [<output-dir>] [<output-json>]");
  process.exit(1);
}
// Chinese file names are kept inside this script (UTF-8 source) so that callers
// never pass non-ASCII arguments through the shell (PowerShell 5.1 mangles them).
const MD_NAME = "DSH工具提示-完整版.md";
const JSON_NAME = "DSH工具提示-完整版.json";
const outMd = outDir ? join(outDir, MD_NAME) : MD_NAME;
const outJson = outJsonArg ?? (outDir ? join(outDir, JSON_NAME) : JSON_NAME);

// --- 1. Resolve the unpacked package tree -----------------------------------
const asarPath = src.endsWith(".asar") ? src : null;
const unpackRoot = asarPath
  ? join(tmpdir(), "dsh-asar-" + Date.now())
  : src;

if (asarPath) {
  mkdirSync(unpackRoot, { recursive: true });
  console.log(`[1/4] unpacking ${asarPath} ...`);
  execSync(`npx --yes @electron/asar extract "${asarPath}" "${unpackRoot}"`, {
    stdio: "inherit",
  });
}
const base = join(unpackRoot, "dsh", "node_modules", "@deepseek-ai") + "/";

const pkgs = [
  "dsh-tool-ask-user", "dsh-tool-bash", "dsh-tool-bash-persistent",
  "dsh-tool-call-timeout-policy", "dsh-tool-cordis", "dsh-tool-fs",
  "dsh-tool-fs-search", "dsh-tool-goal", "dsh-tool-jobs", "dsh-tool-present",
  "dsh-tool-pwsh", "dsh-tool-pwsh-persistent", "dsh-tool-ralph", "dsh-tool-skill",
  "dsh-tool-str-replace-editor", "dsh-tool-subagent", "dsh-tool-subagent-control",
  "dsh-tool-todo", "dsh-tool-web", "dsh-tool-workflow", "dsh-tool-workspace-dependencies",
];

const noop = () => {};
function makeCtx(tools) {
  return {
    tools: { register: (def) => { tools.push(def); return () => {}; }, get: () => undefined },
    systemPrompt: { section: noop, getSectionOrder: () => 0 },
    shell: { sandboxMode: undefined, backendType: undefined },
    fs: { sandboxMode: undefined },
    get: () => undefined,
    on: noop, once: noop, off: noop, emit: noop, effect: noop, using: noop,
    inject: (_deps, cb) => cb(makeCtx(tools)),
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    config: {},
    sessionProjections: { register: noop },
    jobs: { attachController: noop, register: noop, list: noop, output: noop, kill: noop, events: { subscribe: noop } },
    goal: { section: noop, register: noop },
    ralph: { section: noop, register: noop },
    subagent: { register: noop, list: noop },
    subagents: { getProvider: () => undefined, resolveMaxDepth: () => undefined },
    todo: { register: noop },
    skill: { register: noop, section: noop },
    web: { register: noop },
    present: { register: noop },
    workflow: { register: noop, section: noop },
    model: noop, userQuestions: noop, agent: noop,
    approval: undefined, sandboxPolicy: undefined,
  };
}

const CONFIG = {
  sandboxMode: "readonly",
  enableRunInBackground: true, promoteOnTimeout: true,
  readLimit: 100000, readMaxLineLength: 2000, readMaxBytes: 524288, readStreamMinSize: 65536,
  maxOutputChars: 100000, maxFiles: 4, maxResultChars: 50000,
  search: true, fetch: true,
  searchMaxResults: 8, searchMaxQueries: 4,
  fetchTimeoutMs: 30000, searchTimeoutMs: 30000, fetchMaxOutputChars: 100000,
  waitTimeoutMs: 30000, maxWaitTimeoutMs: 600000,
  completionDelivery: "wakeup", maxConsecutiveWakes: 10,
  toolName: "workflow", backendType: "pwsh",
  maxDepth: 3, allowParallelInProgress: true,
  blockedAfterConsecutiveRounds: 3,
  section: "main", source: "C:/Users/LJL", root: "C:/Users/LJL",
  timeout: 120, mode: "legacy",
  glob: true, grep: true, read: true, write: true, edit: true,
  sampleOverCapGlobResults: false, globMaxResults: 100, grepMaxMatches: 250,
  grepMaxLineBytes: 65536, searchMetaMaxBytes: 32768, rawOutputMaxBytes: 65536,
  graceMs: 500, stderrMaxBytes: 65536, timeoutMs: 10000,
  provider: "default", backgroundMode: "one-shot", modelSelectionSettings: false,
  toolFilter: undefined, agentOptions: undefined,
};

// --- 2. Extract all package tools -------------------------------------------
console.log(`[2/4] importing ${pkgs.length} tool packages ...`);
const all = [];
for (const pkg of pkgs) {
  try {
    const mod = await import(pathToFileURL(base + pkg + "/lib/index.js").href);
    if (typeof mod.apply === "function") {
      const tools = [];
      try {
        await mod.apply(makeCtx(tools), { ...CONFIG });
      } catch (e) {
        console.warn(`  ! ${pkg}: ${e.message}`);
      }
      for (const t of tools) {
        all.push({ pkg, name: t.name, description: t.description, parameters: t.parameters ?? null, output: t.output?.schema ?? null });
      }
    }
  } catch (e) {
    console.warn(`  ! ${pkg}: ${e.message}`);
  }
}

// subagent registers only after a provider mounts — stub a provider.
try {
  const mod = await import(pathToFileURL(base + "dsh-tool-subagent/lib/index.js").href);
  const tools = [];
  const provider = {
    name: "default",
    capabilities: { depthLimit: true, agentOptions: true, modelSelection: true },
    prepareContinuable: () => ({}),
  };
  const ctx = makeCtx(tools);
  ctx.subagents.getProvider = () => provider;
  await mod.apply(ctx, { enableRunInBackground: true, maxDepth: 3, provider: "default", backgroundMode: "one-shot", toolName: "subagent" }, {});
  for (const t of tools) all.push({ pkg: "dsh-tool-subagent", name: t.name, description: t.description, parameters: t.parameters ?? null, output: t.output?.schema ?? null });
} catch (e) {
  console.warn(`  ! dsh-tool-subagent (provider stub): ${e.message}`);
}

// --- 3. Dedupe & write outputs ----------------------------------------------
// Same-package same-name tools (bash/pwsh register a foreground-only variant and a
// background variant that never mount together) collapse to one; cross-package
// variants (bash vs bash-persistent) are kept.
const seen = new Set();
const deduped = [];
for (const t of all) {
  const key = t.name + "|" + JSON.stringify(t.parameters);
  const pkgName = t.pkg + "|" + t.name;
  if (seen.has(key) || seen.has(pkgName)) continue;
  seen.add(key);
  seen.add(pkgName);
  deduped.push(t);
}

console.log(`[3/4] ${deduped.length} tools extracted`);
mkdirSync(dirnameOf(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(deduped, null, 2), "utf8");

mkdirSync(dirnameOf(outMd), { recursive: true });
const lines = [
  "# DSH 工具 Schema 完整版（零折叠）",
  "",
  "> 从 DeepSeek Harness `app.asar` 提取。这些工具**仅存在于 DSH 环境**，不属于 WMB 运行时代码。全部字段完整展开、无 `{…}` 省略。",
  "",
  `共 **${deduped.length} 个工具**（含同名变体：bash / pwsh 的 persistent 版）。`,
  "",
];
for (const t of deduped) {
  lines.push(`## ${t.name}`, "");
  if (t.description) lines.push(t.description, "");
  if (t.parameters) {
    lines.push("**parameters**（完整 JSON Schema）:", "");
    lines.push("```json", JSON.stringify(t.parameters, null, 2), "```", "");
  }
  if (t.output) {
    lines.push("**output schema**（模型调用后的返回值结构）:", "");
    lines.push("```json", JSON.stringify(t.output, null, 2), "```", "");
  }
  lines.push("---", "");
}
writeFileSync(outMd, lines.join("\n"), "utf8");
console.log(`[4/4] wrote ${outMd}`);

function dirnameOf(p) {
  const i = p.lastIndexOf("/");
  const j = p.lastIndexOf("\\");
  const k = Math.max(i, j);
  return k === -1 ? "." : p.slice(0, k);
}

// clean up unpacked asar tree
if (asarPath) {
  rmSync(unpackRoot, { recursive: true, force: true });
}
