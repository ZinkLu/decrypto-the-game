# 后端架构

服务端是一个 Go 进程，代码在仓库的 `server/` 目录，自成一个 Go 模块；入口是 `server/cmd/server`。它在同一个端口上提供三样东西：

| 路径 | 内容 |
| --- | --- |
| `/` | 构建好的页面，取自工作目录下的 `web/dist`（可用 `DECRYPTO_WEB_DIR` 改）；`/preview` 返回同一个 `index.html` |
| `/ws` | WebSocket，全部游戏交互都走这里，见 [WebSocket 协议](protocol.md) |
| `/healthz` | 只接受 `GET`，返回 `ok` |

没有其他 HTTP 接口。端口取自 `PORT`（默认 `8080`）。启动顺序是：注册游戏处理函数 → 打开数据库 → 恢复上次未关闭的房间 → 开始监听。房间在接受第一个连接之前就已恢复，因为恢复请求被拒绝的页面会丢弃自己保存的座位。

## 包的划分

以下路径都相对于 `server/`。

```
cmd/server            入口：组装各层，选择存储实现
internal/
  core                游戏规则与回合状态机，不知道网络的存在
    word_providers    词库来源（读取 words.txt）
  ws                  WebSocket 连接、房间内广播、消息类型
  room                房间：房间码、队伍、座位、AI 席位、恢复令牌
  game                桥接层：把 WebSocket 输入接到 core 的处理函数上
  server              消息分发；保存与恢复房间
  store               存储接口 Rooms 及其数据类型，没有实现也没有依赖
    sqlite            Rooms 的 SQLite 实现
  ai                  AI 玩家与 LLMProvider 接口
    providers         Claude 与 OpenAI 兼容接口的实现
```

依赖只朝一个方向：

```
cmd/server ──► server ──► game ──► core ──► core/word_providers
                 │          ├────► ai ◄──── ai/providers
                 │          ├────► room
                 │          └────► ws
                 ├──► room
                 ├──► ws
                 └──► store ◄──── store/sqlite
```

`core`、`room`、`ws`、`store` 互不引用。`server` 只通过 `store.Rooms` 接口认识存储，具体用哪个实现由 `cmd/server/main.go` 决定。

## 游戏核心（`internal/core`）

### 对象

| 类型 | 含义 |
| --- | --- |
| `Session` | 一局游戏：两支队伍、已进行的回合、最大回合数（`MAX_ROUND` = 16） |
| `Team` | 队员、四个关键词、拦截成功次数、解码失败次数 |
| `Player` | `UID` 与昵称 |
| `Round` | 一个回合：行动队伍、对手、加密者、三位密码、三条线索、拦截猜测、解码猜测、当前状态 |

建队时由词库为每队随机抽取四个词。每回合的密码从 `SECRET_CODES`（1–4 中取三个不同数字的全部 24 种排列）里随机取一个。

### 回合状态机

```
NEW → INIT → ENCRYPTING → INTERCEPT → DECRYPT → DONE
```

`Round.Next()` 把状态推进一步。各状态要做的事由外部注册的处理函数完成，`core` 自己不收发任何消息：

| 注册函数 | 调用时机 | 返回 |
| --- | --- | --- |
| `RegisterInitHandler` | 回合开始 | 是否取消 |
| `RegisterEncryptHandler` | 需要加密者给出线索 | 三条线索，是否取消 |
| `RegisterInterceptHandler` | 需要对手拦截 | 三位猜测，是否取消 |
| `RegisterInterceptSuccessHandler` / `RegisterInterceptFailHandler` | 拦截结算之后 | 是否取消 |
| `RegisterDecryptHandler` | 需要本队解码 | 三位猜测，是否取消 |
| `RegisterDecryptSuccessHandler` / `RegisterDecryptFailHandler` | 解码结算之后 | 是否取消 |
| `RegisterDoneHandler` | 回合结束 | 是否取消 |
| `RegisterGameOverHandler` | 对局结束，参数为获胜队伍，平局为 `nil` | 是否取消 |

处理函数是包级变量，整个进程只有一套，在启动时注册一次。处理函数可以阻塞，状态机就停在那里等它返回；返回"取消"则整局停止推进。

```go
core.RegisterEncryptHandler(func(ctx context.Context, r *core.Round, t *core.Team, p *core.Player, ts core.TeamState) ([3]string, bool) {
    return [3]string{"线索一", "线索二", "线索三"}, false // 第二个返回值为 true 表示取消
})
```

- `Round.AutoForward(ctx)` 从当前状态的下一步开始，依次调用处理函数直到 `DONE`。
- `Session.AutoForward(ctx)` 循环"开始新回合 → 推进到结束"，直到对局结束或被取消。
- `Session.Resume(ctx)` 用于恢复后的对局：先让当前回合从保存时所在的状态重新进入，再照常推进。已经结算过的拦截或解码不会再问一次。对尚未开始的对局，它等同于 `AutoForward`。

### 规则（以代码为准）

- 两支队伍，每队至少 2 人。队伍标签固定为 `A`、`B`，A 队先行动，之后两队轮流。
- 最多 16 回合，每队 8 次担任加密方。
- 第 1、2 回合各队的加密者是队内第一位；此后每次轮到该队，加密者顺延一位并循环。
- 第 1、2 回合没有拦截阶段；第 3 回合起，对手先拦截，本队再解码。
- 拦截成功即结束本回合：本队不再解码，也就不会记失误（`Round.IsDecryptSkipped()`）。拦截失败时本队照常解码。
- 猜测与密码三位完全一致才算成功。拦截成功给对手记一次拦截；解码失败给本队记一次失误。
- 每回合结束后判定胜负：一队拦截成功 2 次，或其对手解码失败 2 次，该队获胜。两队在同一回合同时满足条件时比较得分（拦截次数减失误次数），高者胜，相同为平局。
- 16 回合打完仍未分出胜负时，同样按得分判定，相同为平局。

## 桥接层（`internal/game`）

`game.RegisterHandlers()` 把十个处理函数注册到 `core`。每局游戏对应一个 `Bridge`，存放在以对局 ID 为键的全局注册表里（对局 ID 即房间码）；处理函数被调用时凭回合所属的对局 ID 找到自己的 `Bridge`。

### 输入如何到达状态机

`Bridge` 有三个容量为 1 的通道：`CluesCh`、`InterceptCh`、`DecryptCh`。状态机在独立的 goroutine 里运行，处理函数广播阶段变化后阻塞在对应通道上；WebSocket 消息经 `server.Handler` 到达 `Bridge.SubmitClues` / `Bridge.SubmitGuess`，通过校验后写入通道，处理函数随即返回，状态机继续推进。

提交被接受需要同时满足：

- 该玩家在当前阶段有权行动（加密阶段的加密者、拦截阶段的对手、解码阶段加密者的队友）；
- 消息里的回合号与阶段同当前一致；
- 本阶段还没有接受过提交；
- 未超过截止时间加宽限（`Grace`）。

一个阶段只接受一次提交：同队任何一位有权行动的玩家提交后，输入即关闭。进入新阶段时三个通道都会被清空，踩着截止时间的提交不会漏进下一回合。

socket 一侧从不读取 `core` 的状态。`Bridge` 为每位玩家维护一份视图（`ws.GameSyncData`），阶段变化时重建，`phase_change` 与 `full_sync` 都从这份视图生成。

### 时间

默认值在 `game.DefaultTimings`：

| 项 | 时长 | 含义 |
| --- | --- | --- |
| `Encrypt` | 90 秒 | 真人加密 |
| `Guess` | 60 秒 | 真人拦截或解码 |
| `AI` | 120 秒 | 由 AI 完成的整个阶段 |
| `Request` | 30 秒 | AI 的单次模型请求 |
| `BetweenRounds` | 8 秒 | 回合结束到下一回合开始 |
| `AfterIntercept` | 4 秒 | 拦截失败的结果公布到解码开始（拦截成功时回合直接结束） |
| `Grace` | 1.5 秒 | 截止后仍接受在途提交的宽限 |

玩家看到的始终是截止时间本身，宽限只用于服务端判断。

超时后服务端代为结算，并向房间广播 `timeout`：

| 阶段 | 处理 | `outcome` |
| --- | --- | --- |
| 加密 | 发出加密者最近上报的草稿；空行以 `—` 代替 | 有任一行文字为 `draft`，全空为 `blank` |
| 拦截、解码 | 最近上报的三位选择若是合法猜测（1–4 中三个不同数字）则提交；否则提交 `[0,0,0]`，必然失败 | `guess` 或 `none` |

草稿来自玩家的 `progress` 消息：加密者的线索草稿只留在服务端，不转发给任何人。

### AI 席位

玩家 ID 以 `ai-` 开头的席位由服务端代为行动：

| 阶段 | 由 AI 完成的条件 |
| --- | --- |
| 加密 | 本回合加密者是 AI |
| 拦截 | 对手队伍全部是 AI |
| 解码 | 本队除加密者外全部是 AI |

只要有权行动的人里有一位真人，该阶段就等真人提交。

AI 逐条作答：三条线索或三位数字各是一次模型请求。每一步先广播 `ai_thinking`；失败或答案无效时重试一次（状态 `retrying`）；两次都不成功则使用备用答案并广播 `ai_acted`（状态 `fallback`），同时把提示记为本回合的通知。备用线索是"线索暂缺"，备用数字是尚未用过的最小数字，因此猜测始终合法。猜测时遇到因超时留空的线索，直接使用备用数字而不请求模型。AI 猜测的每一步还会广播 `player_progress`，让其他页面像观看真人一样看到逐位选择。

## 房间（`internal/room`）

- **房间码**：四位数字，在开着的房间中唯一；关闭后可再被使用。房间另有一个永不复用的 `ID`（UUID），存储以它为键。同时最多 10000 个房间。
- **成员与座位**：创建者进入 A 队并成为房主。加入者自动落座到人数较少的一队，之后仍可换队或离队。每队最多 4 人，每个房间最多 32 位真人成员；没有座位的成员以 `observer` 身份观看。
- **AI 席位**：只有房主可以添加和移除。ID 形如 `ai-<队>-<代号>`，代号从该队的名字池里随机取一个未使用的。
- **开始**：只有房主可以开始，要求两队各至少 2 人且已落座的真人都在线。`BeginGame` 原子地冻结名单；对局开始后不能加入、换队或增减 AI。
- **恢复令牌**：每位真人进入房间时得到一个 32 字节的随机令牌。此后凭它回到原座位，昵称不作为凭据。
- **设备令牌**：浏览器长期保存的 64 位十六进制串，随 `create_room` / `join_room` 送来，可选。服务端只保存它的 SHA-256（`device_id`），用来记录同一浏览器开过、进过哪些房间，不发给其他玩家。
- **断线**：连接断开后座位标记为离线并保留。`SeatGrace`（20 秒）过后仍未回来：若是房主，房主身份交给仍在线的第一位真人；对局开始前该玩家同时离开队伍，对局进行中座位不变。令牌在房间关闭前一直有效，释放座位后仍可回到房间。
- **关闭**：房间里没有任何真人在线满 `RoomGrace`（10 分钟）即关闭，其对局一并停止。
- **再来一局**：对局结束后任何一位玩家都可以发 `reopen_room`，房间回到大厅，队伍不变；对局期间离线的玩家让出座位。

## 持久化

### 每层一份快照

| 层 | 快照类型 | 恢复函数 | 内容 |
| --- | --- | --- | --- |
| `core` | `SessionSnapshot` | `core.Restore` | 队伍、关键词、每个回合的密码、线索、猜测与所处状态。比分不保存，由回合推算 |
| `room` | `State` | `room.Restore` | 房间码、房主、两队座位、成员及其恢复令牌的哈希。连接状态不保存 |
| `game` | `Snapshot` | `game.Restore` | 上面的 `SessionSnapshot`，加上每位玩家最后看到的视图、超时记录与本回合通知 |

三个恢复函数都拒绝不可能出现的状态（例如既没被截获、也没解码就结束的回合、坐了两次的座位、与房间名单不符的对局），宁可当场拒绝，不在对局中途出错。

### 何时保存

- 房间：每次变化后由 `Handler.roomChanged` 保存并广播。序列化结果与上次相同时不写库，所以玩家上线下线不产生写入。
- 对局：`Bridge` 在每个改变玩家所见内容的地方调用 `saveLocked`——开始时、每个阶段开始时、每次结算时、回合结束时、对局结束时。调用时仍持有锁，玩家看到的内容不会比存下的更新。`new_round` 只是紧随其后那个阶段的预告，不单独保存。
- 开始对局时先存对局，再存"房间已开始"：两者之间重启，得到的是一个大厅，而不是一个找不到对局的房间。

### 重启之后

`Handler.Restore` 读回所有未关闭的房间，所有真人都视为离线，座位与房间按断线后的规则保留（各自重新计时）。对局恢复后处于暂停：不接受输入，视图里的截止时间清零。第一位真人凭恢复令牌回来时调用 `Bridge.Start`，`Session.Resume` 重新进入被打断的阶段，并给出完整的新时限。已结束的对局恢复后停在结束画面。

### 版本

`room.StateVersion` 与 `game.SnapshotVersion` 写在各自的快照里。存下的状态无法再按原样读取时提高对应的版本号：

- 对局版本不符或读不出：房间回到大厅，队伍保留。
- 房间版本不符或读不出：该房间关闭。

两种情况都写日志，不影响启动。只有存储本身读不出时，`Restore` 才返回错误，服务拒绝启动。

### 尽力而为

存储失败只记日志，游戏照常进行。`Handler.Store` 为 `nil` 时房间只存在于内存。

### 存储接口

`store.Rooms` 是服务端对存储的全部要求：

| 方法 | 作用 |
| --- | --- |
| `CreateRoom` | 记录新房间及其创建者 |
| `AddMember` | 记录加入的玩家 |
| `SaveRoom` / `SaveGame` | 替换开着的房间的状态；对局状态传 `nil` 即删除 |
| `CloseRoom` | 关闭房间：删除状态、释放房间码，保留谁开过、进过的记录 |
| `OpenRooms` | 列出所有开着的房间及其状态 |

接口不解读状态内容，状态由服务端写成 JSON。`store/sqlite` 把它们放在 `rooms` 与 `room_members` 两张表里，使用纯 Go 驱动（`modernc.org/sqlite`），可在 `CGO_ENABLED=0` 下构建。数据库文件路径取自 `DECRYPTO_DB_PATH`，默认 `data/decrypto.db`。

## AI 玩家（`internal/ai`）

`LLMProvider` 只有一个方法：

```go
type LLMProvider interface {
    Complete(ctx context.Context, messages []Message) (string, error)
}
```

`AIPlayer` 在它之上提供两个动作：`GenerateSingleClue`（为一个关键词给一条线索）与 `GuessSingleNumber`（为一条线索猜一个编号）。模型输出会被校验：线索不能为空或超过 80 个字符，数字必须在 1–4 之间且不与本回合已猜的重复。不合格按失败处理，进入上面的重试与备用流程。

对局创建时，若名单里有 AI，按以下顺序选择提供方：

| 条件 | 提供方 | 相关环境变量 |
| --- | --- | --- |
| 设置了 `OPENAI_API_KEY` | OpenAI 兼容接口（`/chat/completions`） | `OPENAI_BASE_URL`（默认 `https://api.openai.com/v1`）、`OPENAI_MODEL`（默认 `gpt-4o`）、`OPENAI_MAX_TOKENS`（默认 2048）、`OPENAI_REASONING_EFFORT`、`OPENAI_EXTRA_BODY`（并入每次请求的 JSON 对象） |
| 否则设置了 `ANTHROPIC_API_KEY` | Claude（Messages API） | `ANTHROPIC_BASE_URL`（替换完整的请求地址） |
| 都没有 | 无 | 每一步都直接使用备用答案 |

两个 Key 都设置时使用 OpenAI 兼容接口。OpenAI 兼容接口返回空内容或 `finish_reason` 为 `length` 时视为失败。

## Channel：接入其他入口

这个项目最初是一个聊天频道里的机器人，在 QQ 频道中通过 @ 消息开局和进行游戏；`docs/intro.gif` 是当时的样子，`origin_msg.md` 保留了那个机器人使用的消息文案。机器人的代码已不在仓库中。目前唯一的入口是 WebSocket。

留下来的是 `internal/core` 的边界：它不引用 `ws`、`room` 或任何网络代码，只认处理函数。一个新的入口要驱动一局游戏，做的事情与 `internal/game` 为网页做的相同：

1. 用 `core.NewWithTeams` 建立对局；
2. 注册各状态的处理函数，在其中向自己的用户展示当前阶段，并阻塞等待他们的输入；
3. 调用 `Session.AutoForward`（或恢复后的 `Session.Resume`）。

需要注意，处理函数是进程内唯一的一套。多个入口并存时，要在处理函数内部按对局 ID 分派到各自的实现，如同 `internal/game` 按对局 ID 查找 `Bridge`。

## 测试

```bash
# 在 server/ 目录运行；core 读取词库，需要它的绝对路径。根目录的 make test-server 做同样的事
DECRYPTO_WORDS_PATH="$PWD/words.txt" go test ./...
```

| 包 | 覆盖内容 |
| --- | --- |
| `internal/core` | 自动推进整局；同回合双方达成条件时按得分判定；快照恢复后从被打断的阶段继续，拒绝不可能的快照 |
| `internal/game` | 提交校验与各种结局；超时发出草稿并通知所有人；AI 的请求时限、重试与备用答案；从每一个保存点恢复后继续对局 |
| `internal/room` | 队伍操作、自动落座、断线与房主交接、恢复后座位与令牌不变 |
| `internal/ws` | 消息的 JSON 字段名、三元素数组校验、来源检查 |
| `internal/server` | 大厅与对局经历重启、座位与房间的保留期限、读不出的状态不阻止启动、存储不可用时游戏照常 |
| `internal/store/sqlite` | 重新打开后房间仍在、关闭的房间释放房间码并保留记录、不可用的路径被拒绝 |
| `internal/ai`、`internal/ai/providers` | 拒绝空线索与无效猜测；请求参数、未完成的回答与请求时限 |

`internal/game` 与 `internal/server` 的测试使用缩短的 `Timings`，走的是真实的截止时间。
