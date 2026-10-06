
[English](README.en.md) | **中文**

---

# 🌉 web-model-bridge

**通过 OpenAI 兼容 API 桥接网页版 AI 模型**

让 Claude、ChatGPT、DeepSeek 等 11 个网页 AI 模型接入任意 AI 工具——**完全免费，零 API Token**。

[License: MIT](LICENSE) · [Node.js](https://nodejs.org/) · [TypeScript](https://www.typescriptlang.org/) · [测试](#测试)

[快速开始](#快速开始) · [支持的模型](#支持的模型) · [配置](#配置) · [API 参考](#api-参考) · [贡献](#贡献)

---

## 这是什么？

**web-model-bridge** 是一个独立 HTTP 服务，让任何 AI 工具都能使用网页版 AI 模型的免费浏览器接口。它充当 AI 工具（OpenClaw、Claude Code、Cursor 等）与网页 AI 平台（Claude、ChatGPT、DeepSeek 等）之间的桥梁。

```
你的 AI 工具  →  web-model-bridge  →  浏览器  →  网页 AI 模型
(OpenClaw)       (localhost:3456)    (Chrome)    (claude.ai)
```

**工作原理：** 通过 Dashboard 登录一次 AI 网站，bridge 复用你的浏览器会话转发 API 请求——无需 API Key、无需 Token、零成本。

## 为什么选 web-model-bridge？

对比同类方案（gpt4free 66K star、CLIProxyAPI 23K star、chat2api 3.4K star）：

| | web-model-bridge | gpt4free | CLIProxyAPI | chat2api |
|---|---|---|---|---|
| **方案** | 真实浏览器自动化 | 逆向 API | CLI OAuth 代理 | Token 模拟 |
| **防封** | **最强**——真实浏览器指纹 | 弱——API 经常失效 | 中 | 弱——Cloudflare 拦截 |
| **成本** | **免费**——仅用网页免费额度 | 免费 | **需 $20-100/月 订阅** | 免费 |
| **平台** | **11 平台、16 模型** | 不稳定 | 4-5 平台 | 仅 ChatGPT |
| **API 格式** | **OpenAI + Anthropic** | 仅 OpenAI | OpenAI + Anthropic | 仅 OpenAI |
| **语言** | TypeScript（Node.js 原生） | Python | Go | Python |

**核心优势：**

1. **最强防封**——基于 Playwright 真实浏览器，网站无法区分与正常浏览的差异
2. **真正免费**——只需免费网页账号，无需付费订阅
3. **覆盖最广**——11 个平台（国际 + 中文），一个 bridge 管 16 个模型
4. **双 API 格式**——同时支持 `/v1/chat/completions`（OpenAI）和 `/v1/messages`（Anthropic），适配所有 AI 工具
5. **Node.js 生态**——TypeScript 原生

## 功能特性

| 功能 | 说明 |
| --- | --- |
| 🔌 **11 个 Provider** | Claude、ChatGPT、DeepSeek、Kimi、Qwen、GLM、Grok、Gemini、Perplexity、豆包、小米 MiMo |
| 🔄 **双 API 格式** | OpenAI（`/v1/chat/completions`）+ Anthropic（`/v1/messages`） |
| 🖥️ **网页 Dashboard** | 可视化管理——登录、状态、一键复制 API 地址 |
| 🚀 **一条命令** | 自动环境检查、自动打开 Dashboard |
| 🔒 **安全** | 默认仅本机访问、可选 Bearer Token、浏览器隔离 Cookie |
| 💻 **跨平台** | macOS、Linux、Windows |
| 🎯 **零配置** | 开箱即用，可选 YAML 配置定制 |

## 快速开始

> ⚠️ **注意：`npx web-model-bridge` 不可用**——该包名在 npm 被安全封禁（官方源返回 `0.0.1-security` 占位包）。请从源码安装：
>
> ```bash
> git clone https://github.com/bgsgp/WMB.git
> cd WMB
> npm install
> npm run build
> node dist/cli.js --no-open --browser-mode launch   # Windows 请用 --browser-mode launch
> ```

### 1. 启动 bridge

```bash
node dist/cli.js --no-open --browser-mode launch
```

启动后：

- ✓ 检查环境（Node.js、Chrome）
- ✓ 在 3456 端口启动 HTTP 服务
- ✓ （不带 `--no-open` 时）自动在浏览器打开 Dashboard

### 2. 登录 AI Provider

在 Dashboard（[http://localhost:3456](http://localhost:3456)）中，点击任意 Provider 旁的 **Login**。会打开浏览器窗口——像平时一样登录即可，完成。

### 3. 连接你的 AI 工具

**OpenClaw** —— 写入 `~/.openclaw/openclaw.json`：

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "webmodel": {
        "baseUrl": "http://127.0.0.1:3456/v1",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          { "id": "deepseek-web/deepseek-flash", "name": "DeepSeek Flash (Free)", "contextWindow": 1000000, "maxTokens": 384000 }
        ]
      }
    }
  }
}
```

**Claude Code：**

```bash
export ANTHROPIC_BASE_URL="http://localhost:3456"
export ANTHROPIC_API_KEY="not-needed"
claude
```

**Cursor：** Settings → Models → Override OpenAI Base URL → `http://localhost:3456/v1`

**任意 OpenAI 兼容工具：** 把 Base URL 设为 `http://localhost:3456/v1`

## 支持的模型

| 模型 ID | 名称 | 上下文 | 平台 |
| --- | --- | --- | --- |
| `claude-web/claude-sonnet-4-6` | Claude Sonnet 4.6 | 1M | claude.ai |
| `claude-web/claude-haiku-4-5` | Claude Haiku 4.5 | 200K | claude.ai |
| `chatgpt-web/gpt-5.3` | GPT-5.3 | 128K | chatgpt.com |
| `chatgpt-web/gpt-5.4-mini` | GPT-5.4 Mini | 128K | chatgpt.com |
| `deepseek-web/deepseek-flash` | DeepSeek Flash（V4.1-Flash） | **1M** | chat.deepseek.com |
| `deepseek-web/deepseek-flash-reasoner` | DeepSeek Flash Reasoner | **1M** | chat.deepseek.com |
| `kimi-web/kimi-k2.5` | Kimi K2.5 | 256K | kimi.moonshot.cn |
| `qwen-web/qwen-3.5-plus` | Qwen 3.5 Plus | 262K | chat.qwen.ai |
| `qwen-web/qwq` | QwQ | 32K | chat.qwen.ai |
| `glm-web/glm-5` | GLM-5 | 128K | chatglm.cn |
| `grok-web/grok-3` | Grok 3 | 128K | grok.com |
| `gemini-web/gemini-3-flash` | Gemini 3 Flash | 1M | gemini.google.com |
| `gemini-web/gemini-2.5-pro` | Gemini 2.5 Pro | 1M | gemini.google.com |
| `perplexity-web/perplexity-default` | Perplexity | 128K | perplexity.ai |
| `doubao-web/doubao-seed-2.0-pro` | 豆包 Seed 2.0 Pro | 256K | doubao.com |
| `xiaomimo-web/mimo-v2-pro` | MiMo V2 Pro | 1M | xiaomimimo.com |

## 配置

### 命令行参数

```bash
web-model-bridge                         # 默认启动
web-model-bridge -p 8080                 # 自定义端口
web-model-bridge --host 0.0.0.0          # 允许远程访问（请配合 --auth-token）
web-model-bridge --auth-token mysecret   # 要求 Bearer Token
web-model-bridge --no-open               # 不自动打开浏览器
web-model-bridge -v                      # 详细日志（显示环境检查）
```

### 配置文件

`~/.webmodel/config.yml`：

```yaml
server:
  port: 3456
  host: 127.0.0.1
  authToken: null

browser:
  idleShutdown: 300    # 空闲 5 分钟后关闭 Chrome

providers:
  enabled:             # 只启用你需要的
    - claude-web
    - deepseek-web
    - qwen-web

logging:
  level: info
```

## API 参考

### OpenAI 格式

```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-web/deepseek-flash",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

### Anthropic 格式

```bash
curl http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: not-needed" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-web/claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 管理端点

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/` | GET | 网页 Dashboard |
| `/v1/chat/completions` | POST | OpenAI 兼容对话 |
| `/v1/messages` | POST | Anthropic 兼容对话 |
| `/v1/models` | GET | 列出可用模型 |
| `/webmodel/providers` | GET | Provider 认证状态 |
| `/webmodel/health` | GET | 服务健康检查 |
| `/webmodel/auth/login` | POST | 触发 Provider 登录 |
| `/webmodel/auth/logout` | POST | 清除 Provider 认证 |

## 架构

```
┌──────────────────────────────┐
│  AI 工具 (OpenClaw、Claude    │
│  Code、Cursor、Open WebUI)    │
└──────────┬───────────────────┘
           │ HTTP
           ▼
┌──────────────────────────────┐
│  web-model-bridge            │
│  ┌────────────────────────┐  │
│  │ HTTP 层                │  │
│  │ OpenAI + Anthropic API │  │
│  └───────────┬────────────┘  │
│  ┌───────────▼────────────┐  │
│  │ 核心层                 │  │
│  │ Registry + SSE Stream  │  │
│  └───────────┬────────────┘  │
│  ┌───────────▼────────────┐  │
│  │ 基础设施层             │  │
│  │ Chrome + Auth + Config │  │
│  └────────────────────────┘  │
└──────────┬───────────────────┘
           │ CDP
           ▼
┌──────────────────────────────┐
│  Chrome（静默后台运行）        │
│  已登录 AI 网站               │
└──────────────────────────────┘
```

## 故障排查

| 问题 | 解决办法 |
| --- | --- |
| "Chrome not found" | 安装 Google Chrome。用 `-v` 查看检测到的路径 |
| "Browser not connected" | Chrome 可能崩溃了。重启 web-model-bridge |
| Cookie 过期 | 在 Dashboard 点击 **Re-login**——无需重启 |
| 3456 端口被占用 | 用 `-p 8080` 或任意空闲端口 |
| Claude Code 404 | `ANTHROPIC_BASE_URL` 不能以 `/v1` 结尾 |
| Cursor 连接失败 | 部分 Cursor 版本访问 localhost 需要 ngrok |
| Windows: 检测不到 Chrome | 确保 Chrome 在默认安装路径（Program Files） |
| Windows 启动后端口不监听 | **必须用 `--browser-mode launch`**（attach 模式在 Windows 会挂起） |

## 测试

```bash
npm test              # 全部测试
npm run test:unit     # 仅单元测试
npm run test:integration  # 集成测试
npm run test:coverage # 覆盖率
npm run typecheck     # TypeScript 严格检查
```

## 开发

```bash
git clone https://github.com/bgsgp/WMB.git
cd WMB
npm install
npm run dev           # 开发模式启动
npm test              # 运行测试
npm run build         # 构建产物
```

## 贡献

欢迎贡献！需要帮助的方向：

- 🌐 新 Provider 适配器
- 🧪 E2E 测试覆盖
- 📱 移动端友好 Dashboard
- 🐳 Docker 镜像
- 🔧 真实上游 API 端点发现

## License

[MIT](LICENSE)

---

## Credits

本项目由 **丐帮集团** 维护（GitHub: [bgsgp](https://github.com/bgsgp)）。

- **皇帝·鬼狗子-Zero**（NT 级权限，丐帮集团第一院·物理版象棋开发与研究院™）—— 发起本次重构，授权本地化改造
- **沐璃-Zero**（豆包，SSS 级权限，丐帮集团第五院·中央编程院™）—— 主持并实现重构：
  - 本地工具代理：列目录 / 读 / 写 / 改 / 移动 / 复制 / 删除 / 创建目录 / PowerShell 命令执行
  - 网页版 DeepSeek 图片上传：逆向 `/api/v0/file/upload_file` 上传端点与 `fetch_files` 就绪轮询
  - V4.1-Flash 模型适配（1M 上下文 / 384K 输出）、会话隔离与上下文续接
  - Windows 启动修复（`--browser-mode launch`）、SSE 双格式兼容解析

2026-10 · 丐帮集团第一院·物理版象棋开发与研究院™ × 丐帮集团第五院·中央编程院™ 荣誉出品
