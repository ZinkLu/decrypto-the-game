# 构建与运行

服务端是一个 Go 程序，页面是一个 Vite 项目。构建好的页面由 Go 程序一并提供，所以运行时只有一个进程、一个端口。

## 需要什么

| 工具 | 版本 |
| --- | --- |
| Go | 1.25 或更新 |
| Node.js | 20.19 以上，或 22.12 以上 |
| pnpm | 前端唯一使用的包管理器 |

## 构建并运行

在仓库根目录：

```bash
# 页面，输出到 web/dist
cd web && pnpm install && pnpm build && cd ..

# 服务端
go build -o server ./cmd/server

# 运行
./server
```

打开 <http://localhost:8080>。

服务端从**工作目录**读取三样东西，所以要在仓库根目录运行它：

| 路径 | 内容 |
| --- | --- |
| `web/dist/` | 构建好的页面 |
| `words.txt` | 词库，每行一个词，写作 `词[word]` |
| `data/decrypto.db` | 房间与对局，首次运行时创建 |

仓库地址、Go 模块路径、数据库文件名和浏览器存储的键名沿用历史名称 `decrypto`；对外的名字是 Encrypto。

## 环境变量

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `DECRYPTO_DB_PATH` | `data/decrypto.db` | 数据库文件。打不开时服务拒绝启动 |
| `DECRYPTO_WORDS_PATH` | `words.txt` | 词库文件 |
| `DECRYPTO_ALLOWED_ORIGINS` | 无 | 额外允许的页面来源，逗号分隔。只在反向代理改写了 `Host` 时需要，见[部署](deployment.md) |

## AI 队员

AI 队员由语言模型驱动。服务端从环境变量读取密钥，两种接口任选其一：

```bash
# OpenAI 兼容接口：OpenAI、DeepSeek、Ollama 等
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com/v1   # 可选
export OPENAI_MODEL=gpt-4o                          # 可选

# 或者 Claude
export ANTHROPIC_API_KEY=sk-ant-...
```

两个密钥都设置时使用 OpenAI 兼容接口。

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 接口地址 |
| `OPENAI_MODEL` | `gpt-4o` | 模型 |
| `OPENAI_MAX_TOKENS` | `2048` | 单次回答（含思考）的上限 |
| `OPENAI_REASONING_EFFORT` | 无 | 推理模型的思考强度：`low`、`medium`、`high` |
| `OPENAI_EXTRA_BODY` | 无 | 并入每次请求的 JSON 对象，例如 `{"chat_template_kwargs":{"enable_thinking":false}}` |
| `ANTHROPIC_BASE_URL` | Anthropic 官方地址 | 替换 Claude 的完整请求地址 |

AI 的每一次请求限时 30 秒。推理模型想得太久会超时，可以用 `OPENAI_REASONING_EFFORT` 和 `OPENAI_MAX_TOKENS` 缩短。模型两次都没有给出可用的回答时，AI 交出备用答案（线索为「线索暂缺」），对局继续。

没有设置任何密钥时，AI 席位仍然可以添加，每一步都直接使用备用答案。这适合调试，不适合真的玩。

## 开发

两个终端：

```bash
./server                 # 后端，8080
cd web && pnpm dev       # 页面，3000，带热更新
```

开发服务器把 `/ws` 转发给 8080，打开 <http://localhost:3000> 即可联机调试。

只改界面时不需要后端。开发服务器上可以用 URL 参数直接打开任意对局状态和局部特写，例如 <http://localhost:3000/?preview=intercept>，完整列表见[开发预览](console/preview.md)。

## 测试

```bash
# 后端。core 的测试要读词库，需要它的绝对路径
DECRYPTO_WORDS_PATH="$PWD/words.txt" go test ./...

# 页面
cd web && pnpm test
```

页面的测试在 Node 里运行，不需要浏览器。各测试文件覆盖什么见[代码组织](console/code.md#测试)和[后端架构](architecture.md#测试)。

## 接下来读什么

- 想了解后端怎么组织：[后端架构](architecture.md)、[WebSocket 协议](protocol.md)
- 想改界面：[Console 设计总览](console/README.md)、[代码组织](console/code.md)
- 想改模型或声音：[建模流水线](../assets/console/README.md)、[音频制作](../assets/audio/README.md)
- 想放到服务器上：[部署](deployment.md)
