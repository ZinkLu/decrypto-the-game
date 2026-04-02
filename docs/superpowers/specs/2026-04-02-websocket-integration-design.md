# Decrypto Web 版 WebSocket 集成设计

## 概述

将 Decrypto 游戏的 Go 后端通过 WebSocket 与 React 前端对接，实现多人实时在线游戏。支持房间码组队、自由选队、AI 队友填充。

## 需求确认

| 项目 | 决定 |
|---|---|
| 游戏驱动 | AutoForward + channel-based handler |
| 通信模式 | 混合模式（事件增量 + 全量同步兜底） |
| 房间管理 | 房间码模式，自由组队，每队 2-4 人 |
| 回合结果 | 简洁提示 + 比分，几秒后自动进入下一回合 |
| AI 队友 | LLM 驱动，自定义 provider 接口，无第三方依赖 |
| 状态管理 | 服务端是唯一权威状态源，前端 Zustand 仅做渲染缓存 |

---

## 一、后端分层架构

```
internal/
├── ws/                     # WebSocket 基础设施层
│   ├── hub.go              # 连接管理、房间级广播
│   ├── client.go           # 单连接的读写 goroutine
│   └── message.go          # 消息类型定义（JSON 协议）
│
├── room/                   # 房间管理层
│   ├── room.go             # 房间生命周期：创建、加入、离开、选队、开始
│   └── manager.go          # 房间注册表（room_code → Room）
│
├── game/                   # 游戏桥接层
│   └── bridge.go           # 注册 handler 到 core API，用 channel 阻塞等待输入
│                           # 每次状态变化时通过 ws.Hub 广播
│
├── ai/                     # AI 玩家层
│   ├── provider.go         # LLM 接口定义
│   ├── player.go           # AI 玩家逻辑（生成线索/猜测）
│   └── providers/          # 具体 LLM 实现
│       └── claude.go       # 先实现 Claude，原生 HTTP 调用
│
├── core/api/               # 现有游戏引擎（基本不动）
└── api/                    # 现有 HTTP handler（保留供调试）
```

### 数据流

```
玩家浏览器
  ↕ WebSocket
ws.Client (每个连接一个)
  ↕ 消息路由
ws.Hub (按房间分组广播)
  ↕
room.Room (房间状态：玩家列表、队伍、游戏是否开始)
  ↕ 开始游戏时
game.Bridge (注册 channel-based handler → core.AutoForward)
  ↕ handler 阻塞在 channel 上
core.Session.AutoForward() (一个 goroutine 驱动整局游戏)
```

### Bridge 核心机制

`Bridge` 为每个游戏会话创建一组 channel：

- `cluesCh chan [3]string` — 加密者提交线索
- `interceptCh chan [3]int` — 对方提交拦截猜测
- `decryptCh chan [3]int` — 本方提交解密猜测

注册到 `core.RegisterXxxHandler()` 的 handler 在对应阶段阻塞在 channel 上。WebSocket 收到玩家消息后写入 channel，handler 解除阻塞返回数据，AutoForward 自动推进。

每个 handler 在进入阶段时广播 `phase_change` 事件给所有玩家，告知当前阶段和角色分配。

**注意：** 当前 `core/api/state.go` 的 handler 是全局变量。由于多个游戏会话并发运行，Bridge 需要解决这个问题。方案：在 handler 内部根据 `Round.GetGameSession().SessionID()` 路由到对应的 channel set。每个 Bridge 实例在一个 registry 中注册自己的 channel set，handler 查找对应的 set。

---

## 二、WebSocket 消息协议

统一消息格式：

```json
{ "type": "message_type", "data": { ... } }
```

### Client → Server

| type | data | 说明 |
|---|---|---|
| `create_room` | `{ nickname }` | 创建房间，创建者自动成为房主 |
| `join_room` | `{ room_code, nickname }` | 加入房间 |
| `select_team` | `{ team: "A" \| "B" }` | 选择队伍 |
| `leave_team` | `{}` | 离开当前队伍（回到未分队状态） |
| `add_ai` | `{ team: "A" \| "B" }` | 房主添加 AI 到指定队伍 |
| `remove_ai` | `{ team: "A" \| "B", index }` | 房主移除指定 AI |
| `start_game` | `{}` | 房主开始游戏（两队各 ≥2 人时可用） |
| `submit_clues` | `{ clues: [str, str, str] }` | 加密者提交 3 条线索 |
| `submit_intercept` | `{ guess: [int, int, int] }` | 对方队伍提交拦截猜测 |
| `submit_decrypt` | `{ guess: [int, int, int] }` | 本方队伍提交解密猜测 |
| `request_sync` | `{}` | 客户端请求全量状态同步 |

### Server → Client

| type | data | 说明 |
|---|---|---|
| `room_created` | `{ room_code }` | 房间创建成功 |
| `room_state` | `{ players, team_a, team_b, owner, can_start }` | 房间全量状态 |
| `game_start` | `{ round, your_role, your_team, your_words }` | 游戏开始 |
| `phase_change` | `{ phase, round, encryptor, data... }` | 阶段变化（增量） |
| `clues_submitted` | `{ clues: [str, str, str] }` | 线索已提交 |
| `round_result` | `{ intercept_success, decrypt_success, scores }` | 回合结果 |
| `game_over` | `{ winner, final_scores }` | 游戏结束 |
| `full_sync` | `{ 完整游戏 + 房间状态 }` | 全量同步 |
| `error` | `{ message }` | 错误信息 |

### phase_change 按角色过滤

不同阶段推送的 data 按玩家角色过滤敏感信息：

- **ENCRYPTING**：加密者收到 `{ secret_digits, secret_words }`，其他人只收到 `{ encryptor_name }`
- **INTERCEPT**：对方队伍收到 `{ clues, history }`，加密方收到 `{ waiting: true }`
- **DECRYPT**：本方队伍收到 `{ clues }`，对方收到 `{ waiting: true }`

---

## 三、前端架构

### 新增模块

```
web/src/
├── services/
│   └── websocket.ts        # WebSocket 连接管理（连接、重连、心跳、消息收发）
│
├── store/
│   └── gameStore.ts         # Zustand store：房间状态、游戏状态、WebSocket actions
│
├── pages/
│   ├── Room.tsx             # 新增：房间大厅（玩家列表、队伍选择、AI 填充、开始）
│   ├── RoundResult.tsx      # 新增：回合结果（覆盖层，几秒后自动消失）
│   └── GameOver.tsx         # 新增：游戏结束（胜负 + 比分）
```

### Zustand Store

Zustand 仅作为渲染缓存，所有数据来自服务端 WebSocket 推送。用户操作通过 WebSocket 发送到服务端，服务端验证后推送新状态更新 store。

```typescript
interface GameStore {
  // 连接
  ws: WebSocket | null
  connected: boolean

  // 房间阶段
  roomCode: string | null
  players: Player[]
  teamA: Player[]
  teamB: Player[]
  isOwner: boolean

  // 游戏阶段
  phase: 'room' | 'encrypting' | 'intercept' | 'decrypt' | 'round_result' | 'game_over'
  round: number
  myRole: 'encryptor' | 'teammate' | 'opponent'
  myTeam: 'A' | 'B'
  myWords: string[]
  secretDigits: number[]   // 仅加密者
  clues: string[]
  scores: { teamA: ScoreInfo, teamB: ScoreInfo }

  // actions（发 WebSocket 消息）
  connect(): void
  createRoom(nickname: string): void
  joinRoom(code: string, nickname: string): void
  selectTeam(team: 'A' | 'B'): void
  submitClues(clues: string[]): void
  submitIntercept(guess: number[]): void
  submitDecrypt(guess: number[]): void
}
```

### 页面路由

保留 `App.tsx` 的 `switchPage` 机制，驱动源从 debug 按钮改为 store 状态：

```
store.phase + store.myRole → 当前页面
```

| phase | myRole | 页面 |
|---|---|---|
| `room` | — | Room.tsx（新增） |
| `encrypting` | `encryptor` | Encryptor.tsx |
| `encrypting` | `teammate` | TeammateWaiting.tsx |
| `encrypting` | `opponent` | OpponentWaiting.tsx |
| `intercept` | `opponent` | OpponentIntercepting.tsx |
| `intercept` | `encryptor`/`teammate` | InterceptedWaiting.tsx |
| `decrypt` | `encryptor` | EncryptorWatching.tsx |
| `decrypt` | `teammate` | TeammateDecoding.tsx |
| `decrypt` | `opponent` | OpponentAnalyzing.tsx |
| `round_result` | — | RoundResult.tsx（新增） |
| `game_over` | — | GameOver.tsx（新增） |

### 现有页面改造

所有 9 个现有页面的改动模式一致：

1. 删除 mock 数据和本地 useState
2. 从 `useGameStore()` 读取数据
3. 用户操作调用 store action 发送 WebSocket 消息
4. 保留所有现有 UI/动画/主题逻辑不动

---

## 四、AI 玩家设计

### LLM Provider 接口

```go
// internal/ai/provider.go
type LLMProvider interface {
    Complete(ctx context.Context, messages []Message) (string, error)
}

type Message struct {
    Role    string  // "system" | "user" | "assistant"
    Content string
}
```

不依赖第三方库，各 provider 直接用 `net/http` 调 REST API。先实现 Claude provider。

### AI 玩家行为

AI 参与三种动作：

1. **加密（AI 是加密者）**：给定 3 个目标词 + 历史线索，生成 3 条线索
2. **拦截（AI 在对方队伍）**：根据线索 + 历史记录，猜测密码序列 `[3]int`
3. **解密（AI 是队友）**：根据线索 + 本队词语，猜测密码序列 `[3]int`

每种动作构造 prompt（游戏规则 + 当前轮次 + 历史），调 LLM 拿回结果，解析后写入对应 channel，和真人走同一条通路。

### AI 在房间中的表现

- 显示为特殊玩家（带 AI 标识）
- 房主可在任一队伍空位添加/移除 AI
- 游戏中 AI 操作有 1-3 秒延迟，避免瞬间响应

---

## 五、需要解决的技术要点

### 5.1 全局 Handler 并发问题

`core/api/state.go` 的 handler 是全局变量，但多个游戏会话并发运行。解决方案：

Handler 内部根据 `Round.GetGameSession().SessionID()` 查找对应的 Bridge 实例和 channel set。维护一个全局 `sync.Map[sessionID]*Bridge` 注册表。

### 5.2 超时处理

- 加密阶段：90 秒超时（与前端计时器一致）
- 拦截/解密阶段：60 秒超时
- 超时后服务端自动填充默认值（随机线索/随机猜测）并推进

### 5.3 断线重连

- 客户端 WebSocket 断开后自动重连
- 重连时发送 `request_sync` 获取全量状态
- 服务端为断线玩家保留位置一段时间（如 5 分钟）

### 5.4 房间清理

- 所有玩家离开后延迟清理房间（如 10 分钟）
- 游戏结束后房间保留一段时间供查看结果
