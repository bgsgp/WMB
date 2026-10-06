# web-model-bridge 使用指南

## 快速开始

### 第一步：安装并启动

```bash
# 全局安装
npm install -g web-model-bridge

# 或者用 npx 直接运行（不需要安装）
npx web-model-bridge
```

启动后你会看到：

```
  ✓ Server running at http://localhost:3456
  ✓ API Base: http://localhost:3456/v1
  ✓ 11 providers, 0 authenticated
  ✓ Dashboard: http://localhost:3456 (opening in browser)

  No providers authenticated yet.
  Open the Dashboard to login → http://localhost:3456
```

### 第二步：在 Dashboard 登录 Web 模型

浏览器会自动打开 Dashboard（[http://localhost:3456）。你会看到](http://localhost:3456）。你会看到) 11 个 Provider：


| Provider       | 网站                      | 免费模型                     |
| -------------- | ----------------------- | ------------------------ |
| Claude Web     | claude.ai               | Sonnet 4.6, Haiku 4.5    |
| ChatGPT Web    | chatgpt.com             | GPT-5.3, GPT-5.4 Mini    |
| DeepSeek Web   | chat.deepseek.com       | DeepSeek Flash, Flash Reasoner |
| Kimi Web       | kimi.moonshot.cn        | Kimi K2.5                |
| Qwen Web       | chat.qwen.ai            | Qwen 3.5 Plus, QwQ       |
| GLM Web        | chatglm.cn              | GLM-5                    |
| Grok Web       | grok.com                | Grok 3                   |
| Gemini Web     | gemini.google.com       | Gemini 3 Flash, 2.5 Pro  |
| Perplexity Web | perplexity.ai           | Perplexity               |
| Doubao Web     | doubao.com              | Doubao Seed 2.0 Pro      |
| Xiaomimo Web   | aistudio.xiaomimimo.com | MiMo V2 Pro              |


点击 **[Login]** 按钮 → 弹出登录页面 → 正常登录（和你平时上网一样）→ 登录完成后窗口自动关闭 → Dashboard 显示 ✓ 已认证。

### 第三步：配置你的 AI 工具

#### OpenClaw

编辑 `~/.openclaw/openclaw.json`：

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
            "id": "deepseek-web/deepseek-flash",
            "name": "DeepSeek Flash (Free)",
            "contextWindow": 128000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          },
          {
            "id": "qwen-web/qwen-3.5-plus",
            "name": "Qwen 3.5 Plus (Free)",
            "contextWindow": 262000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  }
}
```

#### Claude Code

web-model-bridge 同时支持 Anthropic API 格式（`POST /v1/messages`），所以 Claude Code 可以直接对接：

```bash
# 注意：ANTHROPIC_BASE_URL 不要加 /v1，SDK 会自动拼接
export ANTHROPIC_BASE_URL="http://localhost:3456"
export ANTHROPIC_API_KEY="not-needed"

# 启动 Claude Code
claude
```

Claude Code 会将请求发送到 `http://localhost:3456/v1/messages` → web-model-bridge 内部转换并路由到对应的 Web 模型。

模型名称使用 `{provider}/{model}` 格式，例如 `claude-web/claude-sonnet-4-6`。

#### Cursor

1. 打开 Settings → Models
2. **Override OpenAI Base URL**: `http://localhost:3456/v1`
3. **OpenAI API Key**: 任意值（如 `not-needed`）
4. 点击 **+ Add Model**，输入模型 ID，例如：
  - `claude-web/claude-sonnet-4-6`
  - `deepseek-web/deepseek-flash`
  - `qwen-web/qwen-3.5-plus`

#### 其他支持 OpenAI API 的工具

只要工具支持自定义 `base_url`，指向 `http://localhost:3456/v1` 即可。例如：

- Open WebUI、LobeChat、ChatBox 等

---

## 可用模型列表

所有模型 ID 格式为 `{provider}/{model}`：


| 模型 ID                               | 名称                   | 上下文  | 平台                      |
| ----------------------------------- | -------------------- | ---- | ----------------------- |
| `claude-web/claude-sonnet-4-6`      | Claude Sonnet 4.6    | 1M   | claude.ai               |
| `claude-web/claude-haiku-4-5`       | Claude Haiku 4.5     | 200K | claude.ai               |
| `chatgpt-web/gpt-5.3`               | GPT-5.3              | 128K | chatgpt.com             |
| `chatgpt-web/gpt-5.4-mini`          | GPT-5.4 Mini         | 128K | chatgpt.com             |
| `deepseek-web/deepseek-flash`          | DeepSeek Flash          | 128K | chat.deepseek.com       |
| `deepseek-web/deepseek-flash-reasoner` | DeepSeek Flash Reasoner | 128K | chat.deepseek.com       |
| `kimi-web/kimi-k2.5`                | Kimi K2.5            | 256K | kimi.moonshot.cn        |
| `qwen-web/qwen-3.5-plus`            | Qwen 3.5 Plus        | 262K | chat.qwen.ai            |
| `qwen-web/qwq`                      | QwQ                  | 32K  | chat.qwen.ai            |
| `glm-web/glm-5`                     | GLM-5                | 128K | chatglm.cn              |
| `grok-web/grok-3`                   | Grok 3               | 128K | grok.com                |
| `gemini-web/gemini-3-flash`         | Gemini 3 Flash       | 1M   | gemini.google.com       |
| `gemini-web/gemini-2.5-pro`         | Gemini 2.5 Pro       | 1M   | gemini.google.com       |
| `perplexity-web/perplexity-default` | Perplexity           | 128K | perplexity.ai           |
| `doubao-web/doubao-seed-2.0-pro`    | Doubao Seed 2.0 Pro  | 256K | doubao.com              |
| `xiaomimo-web/mimo-v2-pro`          | MiMo V2 Pro          | 1M   | aistudio.xiaomimimo.com |


---

## 支持的 API 格式

web-model-bridge 同时支持两种 API 格式：


| 格式        | 端点                          | 适用工具                                   |
| --------- | --------------------------- | -------------------------------------- |
| OpenAI    | `POST /v1/chat/completions` | OpenClaw, Cursor, Open WebUI, LobeChat |
| Anthropic | `POST /v1/messages`         | Claude Code                            |


两种格式使用相同的模型 ID 和 Provider，只是请求/响应格式不同。

---

## 配置选项

### 命令行

```bash
web-model-bridge                         # 默认启动
web-model-bridge -p 8080                 # 自定义端口
web-model-bridge --host 0.0.0.0          # 允许远程访问（需配合 --auth-token）
web-model-bridge --auth-token mysecret   # 设置访问密码
web-model-bridge --no-open               # 不自动打开浏览器
web-model-bridge --state-dir /path       # 自定义数据目录
```

### 配置文件

`~/.webmodel/config.yml`：

```yaml
server:
  port: 3456
  host: 127.0.0.1
  authToken: null

browser:
  idleShutdown: 300        # 无请求 5 分钟后关闭 Chrome 节省内存

providers:
  enabled:                 # 可以只启用需要的 provider
    - claude-web
    - deepseek-web
    - qwen-web

logging:
  level: info
```

---

## 故障排查


| 问题                      | 解决方案                                |
| ----------------------- | ----------------------------------- |
| "Browser not connected" | 确认已安装 Google Chrome                 |
| Cookie 过期               | Dashboard 上点击 [重新登录]                |
| 端口被占用                   | `web-model-bridge -p 8080`          |
| Claude Code 连接失败        | 确认 `ANTHROPIC_BASE_URL` 不带 `/v1` 后缀 |


