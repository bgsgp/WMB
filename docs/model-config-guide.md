# web-model-bridge 模型配置完全指南

本文档详细介绍如何在 **OpenClaw**、**Claude Code**、**Cursor** 三款产品中配置 web-model-bridge 提供的所有模型。

> **前提条件**：先启动 web-model-bridge，并在 Dashboard 中完成对应平台的登录。
>
> ```bash
> npm run dev        # 开发模式
> # 或
> npx web-model-bridge   # 全局运行
> ```
>
> 启动后服务地址为 `http://127.0.0.1:3456`，API 地址为 `http://127.0.0.1:3456/v1`。

---

## 可用模型一览

| 模型 ID | 名称 | 上下文窗口 | 最大输出 | 登录网站 |
|---------|------|-----------|---------|---------|
| `claude-web/claude-sonnet-4-6` | Claude Sonnet 4.6 | 1,000,000 | 8,192 | claude.ai |
| `claude-web/claude-haiku-4-5` | Claude Haiku 4.5 | 200,000 | 8,192 | claude.ai |
| `chatgpt-web/gpt-5.3` | GPT-5.3 | 128,000 | 4,096 | chatgpt.com |
| `chatgpt-web/gpt-5.4-mini` | GPT-5.4 Mini | 128,000 | 4,096 | chatgpt.com |
| `deepseek-web/deepseek-flash` | DeepSeek Flash | 128,000 | 8,192 | chat.deepseek.com |
| `deepseek-web/deepseek-flash-reasoner` | DeepSeek Flash Reasoner | 128,000 | 8,192 | chat.deepseek.com |
| `kimi-web/kimi-k2.5` | Kimi K2.5 | 256,000 | 8,192 | kimi.com |
| `qwen-web/qwen-3.5-plus` | Qwen 3.5 Plus | 262,000 | 8,192 | chat.qwen.ai |
| `qwen-web/qwq` | QwQ | 32,000 | 8,192 | chat.qwen.ai |
| `glm-web/glm-5` | GLM-5 | 128,000 | 4,096 | chatglm.cn |
| `grok-web/grok-3` | Grok 3 | 128,000 | 4,096 | grok.com |
| `gemini-web/gemini-3-flash` | Gemini 3 Flash | 1,000,000 | 8,192 | gemini.google.com |
| `gemini-web/gemini-2.5-pro` | Gemini 2.5 Pro | 1,000,000 | 8,192 | gemini.google.com |
| `perplexity-web/perplexity-default` | Perplexity | 128,000 | 4,096 | perplexity.ai |
| `doubao-web/doubao-seed-2.0-pro` | Doubao Seed 2.0 Pro | 256,000 | 8,192 | doubao.com |
| `xiaomimo-web/mimo-v2-pro` | MiMo V2 Pro | 1,000,000 | 8,192 | aistudio.xiaomimimo.com |

> 共 **11 个 Provider**，**16 个模型**，全部免费（走网页版，无 API 费用）。

---

## 一、OpenClaw 配置

### 配置方式

编辑 `~/.openclaw/openclaw.json`，在 `models.providers` 中添加一个 `webmodel` provider。

### 配置要点

| 配置项 | 值 | 说明 |
|-------|------|------|
| `baseUrl` | `http://127.0.0.1:3456/v1` | 注意：OpenClaw 需要带 `/v1` |
| `apiKey` | `not-needed` | 任意值即可，不会校验 |
| `api` | `openai-completions` | 使用 OpenAI 兼容格式 |
| `cost` | 全部为 `0` | 走网页版，无费用 |

### 完整配置（全部 16 个模型）

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
          {
            "id": "claude-web/claude-sonnet-4-6",
            "name": "Claude Sonnet 4.6 (Free)",
            "contextWindow": 1000000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "claude-web/claude-haiku-4-5",
            "name": "Claude Haiku 4.5 (Free)",
            "contextWindow": 200000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "chatgpt-web/gpt-5.3",
            "name": "GPT-5.3 (Free)",
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "chatgpt-web/gpt-5.4-mini",
            "name": "GPT-5.4 Mini (Free)",
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "deepseek-web/deepseek-flash",
            "name": "DeepSeek Flash (Free)",
            "contextWindow": 128000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "deepseek-web/deepseek-flash-reasoner",
            "name": "DeepSeek Flash Reasoner (Free)",
            "contextWindow": 128000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "kimi-web/kimi-k2.5",
            "name": "Kimi K2.5 (Free)",
            "contextWindow": 256000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "qwen-web/qwen-3.5-plus",
            "name": "Qwen 3.5 Plus (Free)",
            "contextWindow": 262000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "qwen-web/qwq",
            "name": "QwQ (Free)",
            "contextWindow": 32000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "glm-web/glm-5",
            "name": "GLM-5 (Free)",
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "grok-web/grok-3",
            "name": "Grok 3 (Free)",
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "gemini-web/gemini-3-flash",
            "name": "Gemini 3 Flash (Free)",
            "contextWindow": 1000000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "gemini-web/gemini-2.5-pro",
            "name": "Gemini 2.5 Pro (Free)",
            "contextWindow": 1000000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "perplexity-web/perplexity-default",
            "name": "Perplexity (Free)",
            "contextWindow": 128000,
            "maxTokens": 4096,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "doubao-web/doubao-seed-2.0-pro",
            "name": "Doubao Seed 2.0 Pro (Free)",
            "contextWindow": 256000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "xiaomimo-web/mimo-v2-pro",
            "name": "MiMo V2 Pro (Free)",
            "contextWindow": 1000000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  }
}
```

### 只配置单个模型（以豆包为例）

如果你只想用豆包，可以只添加这一个模型：

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
          {
            "id": "doubao-web/doubao-seed-2.0-pro",
            "name": "Doubao Seed 2.0 Pro (Free)",
            "contextWindow": 256000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  }
}
```

---

## 二、Claude Code 配置

### 配置方式

通过环境变量指定 API 地址，Claude Code 会自动使用 Anthropic 兼容格式（`POST /v1/messages`）。

### 配置要点

| 配置项 | 值 | 说明 |
|-------|------|------|
| `ANTHROPIC_BASE_URL` | `http://localhost:3456` | **不要**带 `/v1`，SDK 会自动拼接 |
| `ANTHROPIC_API_KEY` | `not-needed` | 任意值即可 |

### 启动方式

```bash
export ANTHROPIC_BASE_URL="http://localhost:3456"
export ANTHROPIC_API_KEY="not-needed"
claude
```

或者写成一行：

```bash
ANTHROPIC_BASE_URL="http://localhost:3456" ANTHROPIC_API_KEY="not-needed" claude
```

### 选择模型

启动 Claude Code 后，使用 `/model` 命令切换模型，模型 ID 格式为 `provider/model`：

| 模型 ID | 说明 |
|---------|------|
| `claude-web/claude-sonnet-4-6` | Claude Sonnet 4.6 |
| `claude-web/claude-haiku-4-5` | Claude Haiku 4.5 |
| `chatgpt-web/gpt-5.3` | GPT-5.3 |
| `chatgpt-web/gpt-5.4-mini` | GPT-5.4 Mini |
| `deepseek-web/deepseek-flash` | DeepSeek Flash |
| `deepseek-web/deepseek-flash-reasoner` | DeepSeek Flash Reasoner |
| `kimi-web/kimi-k2.5` | Kimi K2.5 |
| `qwen-web/qwen-3.5-plus` | Qwen 3.5 Plus |
| `qwen-web/qwq` | QwQ |
| `glm-web/glm-5` | GLM-5 |
| `grok-web/grok-3` | Grok 3 |
| `gemini-web/gemini-3-flash` | Gemini 3 Flash |
| `gemini-web/gemini-2.5-pro` | Gemini 2.5 Pro |
| `perplexity-web/perplexity-default` | Perplexity |
| `doubao-web/doubao-seed-2.0-pro` | Doubao Seed 2.0 Pro |
| `xiaomimo-web/mimo-v2-pro` | MiMo V2 Pro |

### 持久化配置（可选）

在 `~/.zshrc` 或 `~/.bashrc` 中添加：

```bash
# web-model-bridge for Claude Code
export ANTHROPIC_BASE_URL="http://localhost:3456"
export ANTHROPIC_API_KEY="not-needed"
```

这样每次打开终端都会自动生效，无需手动 export。

---

## 三、Cursor 配置

### 配置方式

通过 Cursor 的 Settings 界面配置 OpenAI 兼容 API。

### 配置步骤

1. 打开 Cursor → **Settings** (Cmd+, 或 Ctrl+,)
2. 搜索 **"OpenAI"** 或进入 **Models** 设置
3. 填写以下配置：

| 配置项 | 值 |
|-------|------|
| Override OpenAI Base URL | `http://localhost:3456/v1` |
| OpenAI API Key | `not-needed`（任意值） |

4. 点击 **+ Add Model**，逐个添加你需要的模型 ID

### 添加模型

点击 **+ Add Model** 后输入模型 ID，每个模型添加一次：

**国产模型：**

| 输入的模型 ID | 说明 |
|--------------|------|
| `deepseek-web/deepseek-flash` | DeepSeek Flash |
| `deepseek-web/deepseek-flash-reasoner` | DeepSeek Flash Reasoner（思维链） |
| `kimi-web/kimi-k2.5` | Kimi K2.5（256K 长上下文） |
| `qwen-web/qwen-3.5-plus` | 通义千问 3.5 Plus |
| `qwen-web/qwq` | QwQ（推理模型） |
| `glm-web/glm-5` | 智谱 GLM-5 |
| `doubao-web/doubao-seed-2.0-pro` | 豆包 Seed 2.0 Pro |
| `xiaomimo-web/mimo-v2-pro` | 小米 MiMo V2 Pro |

**国际模型：**

| 输入的模型 ID | 说明 |
|--------------|------|
| `claude-web/claude-sonnet-4-6` | Claude Sonnet 4.6（1M 上下文） |
| `claude-web/claude-haiku-4-5` | Claude Haiku 4.5（快速） |
| `chatgpt-web/gpt-5.3` | GPT-5.3 |
| `chatgpt-web/gpt-5.4-mini` | GPT-5.4 Mini（快速） |
| `grok-web/grok-3` | Grok 3 |
| `gemini-web/gemini-3-flash` | Gemini 3 Flash（1M 上下文） |
| `gemini-web/gemini-2.5-pro` | Gemini 2.5 Pro（1M 上下文） |
| `perplexity-web/perplexity-default` | Perplexity（带搜索） |

### 使用

添加完成后，在 Cursor 的模型选择下拉菜单中选择对应模型即可使用。

---

## 常见问题

### Q: 三个产品的 API 地址有什么区别？

| 产品 | API 地址 | 原因 |
|------|---------|------|
| OpenClaw | `http://127.0.0.1:3456/v1` | OpenClaw 不自动拼接路径 |
| Claude Code | `http://localhost:3456` | Anthropic SDK 自动拼接 `/v1` |
| Cursor | `http://localhost:3456/v1` | Cursor 不自动拼接路径 |

### Q: API Key 填什么？

随便填，比如 `not-needed`。web-model-bridge 默认不校验 Key（除非你用 `--auth-token` 启动了鉴权）。

### Q: 需要登录哪些网站？

只需要登录你要用的模型对应的网站。比如你只用豆包，那只需要在 Dashboard 里登录 doubao.com。

### Q: 模型 ID 格式是什么？

统一格式：`{provider-id}/{model-id}`，比如 `doubao-web/doubao-seed-2.0-pro`。

### Q: Cookie 过期了怎么办？

打开 Dashboard（http://127.0.0.1:3456），点击对应 Provider 的"重新登录"按钮。

### Q: 可以只启用部分 Provider 吗？

可以，编辑 `~/.webmodel/config.yml`：

```yaml
providers:
  enabled:
    - deepseek-web
    - doubao-web
    - qwen-web
```

这样只会加载这三个 Provider，其他的不会启动。
