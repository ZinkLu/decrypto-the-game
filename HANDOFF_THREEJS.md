# Handoff: 用 three.js 重写 Decrypto 前端

> 写给接手重写任务的 session。本文档是与 Go 后端对接的**完整契约** + 任务边界。
> 读完这份文档即可开工，不需要读旧前端代码。

## 0. 任务定义

- **把 `web/` 下的现有前端整体废弃，用 three.js 从零重做。**
- 不参考、不迁移任何现有 UI 实现（页面、组件、CSS 全部推倒）。视觉与交互自由发挥。
- 硬性要求：**UI 必须炫酷，且贴合游戏背景**（冷战谍报 / 情报截获 / 密码战，见第 2 节）。
- **Go 后端一行不改**。后端通过 WebSocket 驱动全部游戏状态，协议见第 4 节，这是唯一的对接契约。
- 构建产物必须输出到 `web/dist/`（Go 服务器直接托管该目录）。

## 1. 运行与构建

```bash
# 后端（仓库根目录；words.txt 必须存在于工作目录）
go build -o server ./cmd/server && ./server        # http://localhost:8080

# 前端开发（web/ 目录）
pnpm install && pnpm dev                            # :3000，已配置代理 /ws → ws://localhost:8080

# 前端构建
pnpm build                                          # tsc && vite build → web/dist
```

- 生产模式：Go 服务器托管 `web/dist` 静态文件 + `/ws` WebSocket 端点，单端口 8080。
- `/api` 代理存在但后端**没有任何 HTTP API**，只有 `/ws`。
- AI 玩家（可选）：服务端读取 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`(+`OPENAI_BASE_URL`/`OPENAI_MODEL`)。不设置也能玩，AI 用占位桩（线索是 `"clue1"` 这种，拦截/解密走固定逻辑）。

## 2. 游戏背景与规则（服务端实现版）

Decrypto（谍报风云）：两支情报机构对抗，各自持有 **4 个秘密词**（词库是中文词，见 `words.txt`，如 `王牌[ace]`）。每回合一方出一名**加密者**，拿到一个 3 位密码（每位 1–4，对应本方 4 个词的位置），给出 3 条**公开线索**，目标是让队友猜对密码、同时让对方无法从线索历史中推理出词序。

服务端实现的精确规则：

- 两队，每队 **≥2 人** 才能开局（可以是 AI）。队伍标签固定为 `"A"` / `"B"`。
- 最多 **16 回合**（每队加密 8 次），两队轮流当"当前队伍"，队内加密者轮换。
- 每回合流程：`ENCRYPTING`（加密者写 3 条线索）→ `INTERCEPT`（对方猜密码，**第 1、2 回合跳过此阶段**）→ `DECRYPT`（己方队友猜密码）。
- 拦截成功 = 猜测与密码**完全一致**。拦截成功后**本回合直接结束**（跳过 DECRYPT）。
- 胜负：任一队 **拦截成功 2 次** 获胜；任一队 **解密失败 2 次** 判负（对方获胜）；16 回合打满后的平局判定见 `internal/core/session_api.go`。
- 超时行为（服务端硬编码，前端应做对应倒计时 UI）：
  - 加密 90s → 自动提交 `["...", "...", "..."]`
  - 拦截 60s → 自动 `[0,0,0]`（= 放弃/必然失败）
  - 解密 60s → 自动 `[0,0,0]`（= 必然失败，计一次解密失误）
- 回合节奏：每回合结束到下回合开始固定 **5s** 结算展示；拦截失败后额外 **3s** 停顿才进入解密。

**密码语义**：`[2,4,1]` 表示"第 1 条线索对应我方第 2 个词，第 2 条对应第 4 个，第 3 条对应第 1 个"。对手看不到我方的词，只能看到线索历史和之前的密码。

## 3. 每回合消息时间线（前端状态机的依据）

以第 N 回合、当前队伍 T 为例（所有 `phase_change` 都是**按人个性化**的，每人收到的 `your_role` 和附带数据不同）：

```
round 1:        game_start → (同上流程，但无 intercept 阶段)
每回合:         phase_change(encrypting)
                  → encryptor 收到 secret_digits[3] + secret_words[3]，其他人 waiting=true
                [encryptor 提交后] clues_submitted（广播线索+历史）
round ≥3:       phase_change(intercept)
                  → opponent 收到 clues，其他人 waiting=true
                round_result{intercept_success: bool}
                  → 失败: 停 3s 继续；成功: 本回合结束
                phase_change(decrypt)
                  → teammate 收到 clues；encryptor 收到 secret_digits + waiting=true；opponent waiting=true
                round_result{decrypt_success: bool}
5s 后:          phase_change(new_round) 进入下一回合
终局:           game_over{winner, score_a, score_b}
```

角色定义（`your_role`，每回合随 phase_change 重新下发）：
- `encryptor`：本回合当前队伍的加密者
- `teammate`：当前队伍非加密者（负责解密）
- `opponent`：对方队伍全员（负责拦截）
- full_sync 中还可能出现 `observer`（理论上不会在正常对局中出现）

**注意**：`round_result` 每回合会到**两次**（拦截后一次、解密后一次），字段是可选指针，第一次只有 `intercept_success`，第二次只有 `decrypt_success`。前端要按"部分结果"处理，而不是当成完整结算。拦截成功时第二次不会来。

## 4. WebSocket 协议契约（唯一权威来源：`internal/ws/message.go`）

端点：`ws://<host>/ws`。消息均为 JSON 信封：`{"type": "...", "data": {...}}`。

### 4.1 客户端 → 服务端

| type | data | 说明 |
|---|---|---|
| `create_room` | `{nickname}` | 创建房间，响应 `room_created` |
| `join_room` | `{room_code, nickname}` | 加入（开局后拒绝） |
| `select_team` | `{team}` | `"A"` / `"B"` |
| `leave_team` | `{}` | |
| `add_ai` | `{team}` | 仅房主 |
| `remove_ai` | `{team, index}` | 仅房主 |
| `start_game` | `{}` | 仅房主，需 `can_start` |
| `submit_clues` | `{clues: [string×3]}` | 仅当前加密者；重复提交返回 error |
| `submit_intercept` | `{guess: [int×3]}` | 1–4；发 `[0,0,0]` 等于放弃 |
| `submit_decrypt` | `{guess: [int×3]}` | 同上 |
| `progress` | 见下 | 输入过程实时广播（氛围功能，见 4.3） |
| `request_sync` | `{}` | 请求全量同步 |

### 4.2 服务端 → 客户端

| type | data 关键字段 | 触发时机 |
|---|---|---|
| `room_created` | `{room_code, my_player_id}` | 建房成功 |
| `room_state` | `{room_code, players[], team_a[], team_b[], owner_id, can_start, my_player_id}` | 大厅任何变化（个性化：各自收到自己的 my_player_id） |
| `game_start` | `{round, your_role, your_team, words[4]}` | 第 1 回合开始（个性化） |
| `phase_change` | `{phase, round, your_role, encryptor, secret_digits?, secret_words?, clues?, history?, waiting?}` | 阶段切换（个性化，取值见下） |
| `clues_submitted` | `{phase, round, clues[3], history[]}` | 加密者提交线索后广播给全房间 |
| `round_result` | `{intercept_success?, decrypt_success?, score_a, score_b}` | 每回合最多两次（见第 3 节） |
| `game_over` | `{winner: "A"\|"B"\|null, score_a, score_b}` | 终局 |
| `full_sync` | `{room?, game?}` | `request_sync` 的响应 |
| `ai_thinking` / `ai_acted` | `{action, player, step, total}` | AI 逐步行动（`action`: encrypt/intercept/decrypt） |
| `player_progress` | `{action, player, state?, step, focus?, guesses?, total}` | 某玩家输入进度（见 4.3） |
| `error` | `{message}` | 业务错误（房间不存在、权限、重复提交等） |

`phase_change.phase` 取值：`"encrypting"` / `"intercept"` / `"decrypt"` / `"new_round"`。
`new_round` 的语义 = "第 round 回合即将开始"，此时 `your_role` 已更新，前端应据此决定进入加密/等待中的哪个视角（旧实现逻辑：encryptor→出题视角；waiting=true→对手先行动视角；否则→等己方线索视角）。

数据结构：

```ts
interface PlayerInfo { id: string; nickname: string; is_ai: boolean }
interface ScoreInfo { interceptions: number; decrypt_failures: number }
interface RoundHistoryRow {
  round: number; team: "A"|"B"; clues: string[];
  secret?: number[]; intercept?: number[]; decrypt?: number[];
}
```

`full_sync.game.phase` 取值与 phase_change **不同**：是内部状态名 `"new"|"init"|"encrypting"|"intercept"|"decrypt"|"done"`（`internal/server/handler.go` 的 `stateToPhase`）。映射时注意。

### 4.3 实时进度频道（`progress` / `player_progress`）

这是纯氛围功能，不影响游戏逻辑，但强烈建议保留——它让"围观"视角活起来：

- 玩家在填写线索/猜测时持续发送 `progress`：`{action, state: "idle"|"editing"|"submitted", step: 已完成数0-3, focus: 当前槽位1-3, guesses: [各槽已选数字,0=未选], total: 3}`。
- 服务端加上 `player`（昵称）后以 `player_progress` 广播全房间。AI 玩家也会模拟发同样的流。
- 用途：旁观者能看到对方"正在填第 2 个数字""已提交"等实时状态（旧实现用它点亮示波器）。

## 5. 已知的坑（务必处理）

1. **断线无法恢复原对局**。服务端身份绑定在 WS 连接上，重连 = 新连接 = 新身份；`request_sync` 只能恢复大厅状态，进行中的对局无法找回（`join_room` 会拒绝已开局的房间）。前端至少要：明确展示连接状态；断线后优雅降级回首页，不要让界面卡死在游戏中间。（如想修复，需要加"带 player_id 重连"的协议扩展，属于后端改动，需另行提出。）
2. **`round_result` 是增量到达的**（见第 3 节），且 `intercept_success`/`decrypt_success` 是可选字段——`undefined` 表示"与本字段无关"，不等于 false。
3. **第 1、2 回合没有 intercept 阶段**，UI 不要傻等 `phase_change("intercept")`。
4. 加密者在 decrypt 阶段会收到 `secret_digits`（他知道答案，是围观视角），别把他的视角做成输入态。
5. `history` 只在 `phase_change` / `clues_submitted` / `full_sync` 里下发，`round_result` 里没有——需要历史表时自己缓存拼接。
6. AI 无 API key 时是占位桩（线索为 `clue1/clue2/clue3`），属正常现象，不是 bug。

## 6. 前端工程约束

- 技术栈自由，但必须是 three.js 渲染驱动。旧栈为 React 19 + zustand + Vite + Tailwind 4，可沿用壳也可全换；旧依赖里的 `pixi.js`/`@pixi/react`/`gsap` 本来就是**未使用的死依赖**，直接删。
- 词库与线索是**中文**，字体方案必须覆盖 CJK。
- 这是信息密集型游戏：4 个词、3 条线索、逐回合历史表是核心信息，无论视觉多炫，**可读性不能牺牲**。
- 需要覆盖的界面状态清单（由协议推导，而非照搬旧页面）：
  1. 首页（创建/加入房间）
  2. 房间大厅（分队、加/删 AI、房主开局、连接状态）
  3. 加密视角（看密码、写 3 条线索、90s 倒计时）
  4. 等待出题视角（teammate/opponent 两种措辞）
  5. 拦截视角（opponent 看线索+历史、猜 3 位密码、60s）
  6. 解密围观视角（encryptor 看队友实时进度）
  7. 解密视角（teammate 看线索、猜密码、60s）
  8. 拦截后等待视角（opponent 已提交，等解密结果）
  9. 回合结算（拦截/解密两个结果的展示节奏）
  10. 终局（胜负 + 总比分）
- 现有 `web/src/store/gameStore.ts` 是一份**正确的协议客户端参考实现**（消息分发、new_round 视角推导），协议细节有歧义时可以看它，但 UI 代码不要带过来。
- `design/` 目录是旧 UI 的设计文档（冷战档案风、张力系统），仅作背景灵感，不要求遵循。

## 7. 验收标准

- `pnpm build` 通过，产物在 `web/dist`，`./server` 单端口可玩完整对局。
- 两个浏览器窗口 + AI 补位能跑通：建房→分队→开局→至少 3 个完整回合（覆盖 intercept 阶段）→终局。
- 正确处理第 5 节全部坑。
