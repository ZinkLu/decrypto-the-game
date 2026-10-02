# WebSocket 协议

页面与服务端之间的全部游戏交互都经过一条 WebSocket 连接。服务端是唯一的状态来源；页面只保存收到的内容。消息类型与载荷定义在 `server/internal/ws/message.go`，页面一侧的处理在 `web/src/store/gameStore.ts`。

## 连接

地址是同一域名下的 `/ws`（页面为 `https` 时用 `wss`）。

浏览器连接必须来自本站。握手时按以下顺序检查 `Origin`：

1. 没有 `Origin`（非浏览器客户端）：接受。
2. `Origin` 必须是只含协议与主机的 `http` / `https` 地址，否则拒绝。
3. 主机与请求的 `Host` 相同：接受。
4. 双方都是本机地址（`localhost` 或回环 IP，端口不限）：接受。开发时 Vite 在另一个端口上即属此类。
5. 与 `DECRYPTO_ALLOWED_ORIGINS` 中某一项完全相同（逗号分隔，不区分大小写）：接受。

服务端约每 54 秒发一次 ping，60 秒内收不到 pong 即断开。

## 消息格式

消息是 JSON 文本帧。

```jsonc
// 页面 → 服务端
{ "type": "submit_clues", "data": { "round": 3, "clues": ["花园", "远航", "迁徙"] } }

// 服务端 → 页面
{ "type": "phase_change", "data": { /* ... */ }, "server_time": 1790000000000 }
```

`server_time` 是消息发出时服务端的时钟（Unix 毫秒）。所有截止时间都以服务端时钟表示，页面用 `server_time` 估算两边时钟之差，再把截止时间换算到本机时钟：取最近 16 个样本中"服务端时间减本机时间"的最大值作为偏移，因为每个样本都偏小一个网络延迟。

### 限制

| 项 | 限制 |
| --- | --- |
| 单条上行消息 | 4096 字节 |
| 昵称 | 去掉首尾空白后非空，最多 20 个字符 |
| 线索 | 去掉首尾空白后非空，最多 80 个字符 |
| `clues`、`guess` | 必须恰好三个元素 |
| 猜测 | 1–4 中三个互不相同的数字 |
| 每队人数 | 最多 4 |
| 每个房间的真人成员 | 最多 32 |
| 每个连接的待发队列 | 256 条，满了之后的消息被丢弃 |

## 页面 → 服务端

| 类型 | 载荷 | 说明 |
| --- | --- | --- |
| `create_room` | `nickname`，`device_token`（可选） | 创建房间，创建者进入 A 队并成为房主 |
| `join_room` | `room_code`，`nickname`，`device_token`（可选） | 加入房间并自动落座到人数较少的一队；对局已开始时被拒绝 |
| `resume_room` | `room_code`，`resume_token` | 凭恢复令牌回到原座位 |
| `select_team` | `team`：`"A"` 或 `"B"` | 换到指定队伍 |
| `leave_team` | 无 | 离开队伍，留在房间里 |
| `add_ai` | `team` | 仅房主；在该队添加一个 AI 席位 |
| `remove_ai` | `team`，`index` | 仅房主；`index` 是该席位在队内的位置（从 0 起），该位置必须是 AI |
| `start_game` | 无 | 仅房主；两队各至少 2 人且已落座的真人都在线 |
| `submit_clues` | `round`，`clues`：三条线索 | 仅本回合加密者，加密阶段 |
| `submit_intercept` | `round`，`guess`：三位数字 | 仅对手队伍，拦截阶段 |
| `submit_decrypt` | `round`，`guess`：三位数字 | 仅加密者的队友，解码阶段 |
| `progress` | 见下 | 行动中的玩家上报输入进度 |
| `request_sync` | 无 | 请求一次 `full_sync` |
| `reopen_room` | 无 | 对局结束后让房间回到大厅；任何玩家都可以发 |

已经在房间里的连接再发 `create_room`、`join_room`、`resume_room` 会被拒绝。同一位玩家从新连接恢复后，旧连接被关闭，其后续消息被忽略。

`device_token` 是 64 位十六进制串。格式不符时按没有令牌处理。

### `progress`

| 字段 | 含义 |
| --- | --- |
| `round` | 当前回合号 |
| `action` | `"encrypt"`、`"intercept"` 或 `"decrypt"` |
| `state` | `"idle"`（尚未操作）、`"editing"`（正在某一格上）、`"submitted"`（已按下发送） |
| `step` | 已完成的格数，0–3 |
| `focus` | 正在操作的格，1–3；没有则为 0 |
| `guesses` | 拦截与解码：每一格当前选的数字，未选为 0 |
| `filled` | 加密：每一行是否已有文字 |
| `clues` | 加密：线索草稿的文字 |
| `total` | 总格数；服务端转发时固定为 3 |

只有当前有权行动的玩家、在正确的回合与阶段、截止之前发来的进度才被接受。不合格的进度被直接丢弃，不回错误。

被接受的进度做两件事：

- 服务端记下草稿：`clues`（加密），或长度为 3 的 `guesses`（拦截、解码）。时间用尽时据此代为提交。
- 向房间广播 `player_progress`。转发的字段是 `action`、`state`、`step`、`focus`、`guesses`、`filled`，加上发送者的昵称；`clues` 不在其中。

## 服务端 → 页面

| 类型 | 发给 | 说明 |
| --- | --- | --- |
| `room_created` | 本人 | 创建或加入成功 |
| `room_resumed` | 本人 | 恢复成功 |
| `room_state` | 房间内每个人 | 房间有变化时 |
| `game_start` | 每个人，各不相同 | 第 1 回合开始 |
| `phase_change` | 每个人，各不相同 | 进入新阶段 |
| `clues_submitted` | 房间 | 真人加密者的线索已发出（含超时代发） |
| `round_result` | 房间 | 拦截结算、解码结算、回合结束，各一次 |
| `game_over` | 房间 | 对局结束 |
| `full_sync` | 本人 | 恢复之后，或应 `request_sync` |
| `player_progress` | 房间 | 行动者的输入进度 |
| `ai_thinking` / `ai_acted` | 房间 | AI 作答的每一步 |
| `timeout` | 房间 | 某个行动时间用尽，以及如何结算 |
| `error` | 本人 | 请求被拒绝 |

"房间"指当时连接在该房间里的所有页面，包括没有座位的成员。

### `room_created` / `room_resumed`

| 字段 | 含义 |
| --- | --- |
| `room_code` | 四位数字房间码 |
| `my_player_id` | 本人的玩家 ID |
| `resume_token` | 恢复令牌 |

### `room_state`

| 字段 | 含义 |
| --- | --- |
| `room_code` | 房间码 |
| `started` | 对局是否已开始 |
| `owner_id` | 房主的玩家 ID |
| `can_start` | 此刻能否开始 |
| `team_a`，`team_b` | 两队座位，按座次 |
| `players` | 两队全体，其后是在线但没有座位的成员 |
| `my_player_id` | 收件人自己的玩家 ID |

每位玩家是 `{ id, nickname, is_ai, disconnected }`，`disconnected` 仅在离线时出现。

### `game_start`

| 字段 | 含义 |
| --- | --- |
| `round` | 回合号，即 1 |
| `your_role` | 收件人在本回合的角色 |
| `your_team` | `"A"`、`"B"`，没有座位时为空 |
| `words` | 收件人所在队伍的四个关键词；没有座位时为空 |

角色取值：

| `your_role` | 含义 |
| --- | --- |
| `encryptor` | 本回合的加密者 |
| `teammate` | 加密者的队友 |
| `opponent` | 另一队的队员 |
| `observer` | 没有座位 |

### `phase_change`

`phase` 取 `"new_round"`、`"encrypting"`、`"intercept"`、`"decrypt"`。`new_round` 在第 2 回合起的每个回合开头发出，紧接着就是同一回合的 `encrypting`；页面把两者都当作加密阶段。

| 字段 | 谁能收到 | 含义 |
| --- | --- | --- |
| `phase`，`round` | 所有人 | 阶段与回合号 |
| `your_role` | 所有人，各不相同 | 收件人在本回合的角色 |
| `encryptor` | 所有人 | 加密者的昵称 |
| `waiting` | 所有人，各不相同 | 收件人在本阶段无需行动时为 `true` |
| `deadline` | 所有人 | 本阶段的截止时间（服务端时钟，Unix 毫秒）；`new_round` 为 0 |
| `secret_digits`，`secret_words` | 仅加密者 | 本回合的密码及其对应的三个关键词。整个回合的每个阶段都带，供加密者对照他人的猜测 |
| `clues` | 所有人 | 本回合的三条线索；仅 `intercept` 与 `decrypt` 阶段 |
| `history` | 所有人 | 此前各回合的记录 |
| `notice` | 所有人 | 本回合的通知，例如 AI 使用了备用答案 |

由 AI 完成的阶段，`deadline` 是整个阶段的时限（默认 120 秒）。

### 历史记录的一行

| 字段 | 含义 |
| --- | --- |
| `round` | 回合号 |
| `team` | 该回合的加密方 |
| `clues` | 三条线索 |
| `secret` | 该回合的密码 |
| `intercept` | 对手的拦截猜测；没有拦截阶段或未给出时为 `[0,0,0]` |
| `decrypt` | 本队的解码猜测；未给出时为 `[0,0,0]`。对手截获成功、本队没有解码时不带这个字段 |
| `timeouts` | 该回合中时间用尽的行动：`"encrypt"`、`"intercept"`、`"decrypt"`。只出现在刚结束的那一回合的行上（回合结束的 `round_result` 与 `game_over`）；此后 `phase_change` 里的同一行不再带它 |

`phase_change` 里的 `history` 只含已经结束的回合，所以密码公开时该回合已经结算完毕。

### `clues_submitted`

| 字段 | 含义 |
| --- | --- |
| `phase` | 固定为 `"encrypting"` |
| `round` | 回合号 |
| `clues` | 三条线索 |
| `history` | 此前各回合的记录 |

载荷沿用 `phase_change` 的结构，其余字段为空值。AI 加密时不发这条消息，线索随下一个 `phase_change` 到达。

### `round_result`

一个回合里最多发三次：

| 时机 | 带有的字段 |
| --- | --- |
| 拦截结算后 | `intercept_success` |
| 解码结算后 | `decrypt_success` |
| 回合结束 | `complete: true`，以及包含本回合在内的 `history` |

每次都带 `round`、`score_a`、`score_b`，有通知时带 `notice`。比分是 `{ interceptions, decrypt_failures }`：该队拦截成功的次数与该队解码失败的次数。

### `game_over`

| 字段 | 含义 |
| --- | --- |
| `winner` | `"A"` 或 `"B"`；平局时没有这个字段 |
| `reason` | `"interceptions"`（两次拦截）、`"errors"`（对手两次解码失败）、`"score"`（双方同时达成条件或打满回合，按得分判定）、`"draw"` |
| `round` | 结束时的回合号 |
| `history` | 完整记录，含最后一回合 |
| `score_a`，`score_b` | 最终比分 |
| `words_a`，`words_b` | 两队的关键词，此时公开 |
| `notice` | 最后一回合的通知 |

### `full_sync`

| 字段 | 含义 |
| --- | --- |
| `room` | 与 `room_state` 相同 |
| `game` | 对局中才有；收件人此刻应当看到的全部内容 |

`game` 的字段：

| 字段 | 含义 |
| --- | --- |
| `phase` | `"encrypting"`、`"intercept"`、`"decrypt"`、`"round_result"` 或 `"game_over"` |
| `round`，`your_role`，`your_team`，`encryptor`，`waiting`，`deadline`，`notice` | 同 `phase_change` |
| `words` | 收件人所在队伍的关键词 |
| `clues`，`secret_digits`，`secret_words`，`history` | 同 `phase_change`，可见范围相同 |
| `submitted` | 收件人一方在本阶段的提交已被接受 |
| `score_a`，`score_b` | 当前比分 |
| `round_result` | 本回合已公布的结算结果 |
| `timeout` | 本回合最近一次超时 |
| `ai_status` | 最近一次 AI 状态 |
| `game_over` | 对局结束后的 `game_over` 载荷 |

只有 `room` 而没有 `game`，说明房间在大厅里。

### `player_progress`

| 字段 | 含义 |
| --- | --- |
| `action` | `"encrypt"`、`"intercept"` 或 `"decrypt"` |
| `player` | 行动者的昵称 |
| `state`，`step`，`focus`，`guesses`，`filled`，`total` | 同 `progress` |

AI 猜测时服务端也发这条消息，`player` 是该 AI 席位的代号，`guesses` 是它已经选定的数字。

### `ai_thinking` / `ai_acted`

| 字段 | 含义 |
| --- | --- |
| `action` | `"encrypt"`、`"intercept"` 或 `"decrypt"` |
| `player` | AI 席位的代号 |
| `state` | `ai_thinking`：`"thinking"`、`"retrying"`；`ai_acted`：`"completed"`、`"fallback"` |
| `step` | 正在作答的第几步，1–3 |
| `completed` | 已完成的步数 |
| `total` | 固定为 3 |
| `notice` | 重试或使用备用答案时的说明 |

### `timeout`

| 字段 | 含义 |
| --- | --- |
| `round` | 回合号 |
| `action` | `"encrypt"`、`"intercept"` 或 `"decrypt"` |
| `team` | 时间用尽的队伍 |
| `player` | 加密超时时为加密者的昵称；拦截与解码超时时没有这个字段 |
| `outcome` | 加密：`"draft"`（已发出写好的草稿）或 `"blank"`（什么都没写）；猜测：`"guess"`（已提交选好的数字）或 `"none"`（没有完整的猜测） |

### `error`

| 字段 | 含义 |
| --- | --- |
| `code` | 目前只有 `"resume_expired"`：恢复令牌无效或房间已不存在。其他错误没有这个字段 |
| `message` | 英文说明 |

`message` 的取值：

| 场合 | `message` |
| --- | --- |
| 消息不是合法 JSON | `invalid message format` |
| 未知类型 | `unknown message type: <type>` |
| 已在房间里 | `already in a room` |
| 昵称不合格 | `nickname must contain 1 to 20 characters` |
| 房间数已满 | `room capacity reached; try later` |
| 房间不存在，或尚未进入房间 | `room not found` |
| 房间成员已满 | `room is full` |
| 对局已开始（加入、换队、离队、增减 AI、再次开始） | `game already started` |
| 恢复失败 | `room resume expired; please create or join a room` |
| 队伍名无效 | `invalid team "<team>": must be A or B` |
| 队伍已满 | `team <team> is full (max 4 players)` |
| 非房主操作 | `only the room owner can add AI players` / `... remove AI players` / `... start the game` |
| 移除的席位无效 | `index <n> out of range for team ...` / `player at index <n> in team <team> is not an AI` |
| 人数不足或有人离线 | `not enough players to start (need at least 2 per team)` |
| 对局尚未结束就重开 | `game still in progress` |
| 找不到对局 | `game session not found` |
| 无权在本阶段行动 | `not allowed to act in this phase` |
| 回合或阶段不符、已有提交、已过截止 | `stale or already submitted action; sync and try again` |
| 线索不合格 | `provide three nonempty clues (80 characters max)` / `provide exactly three clues` |
| 猜测不合格 | `guess must contain three different digits from 1 to 4` / `provide exactly three guesses` |

## 一局的消息顺序

### 进入房间

```
create_room  →  room_created（本人）  →  room_state（房间）
join_room    →  room_created（本人）  →  room_state（房间）
select_team / leave_team / add_ai / remove_ai  →  room_state（房间）
有人断线或座位被释放                              →  room_state（房间）
```

### 一个回合

以第 N 回合为例。`phase_change` 与 `game_start` 是逐人生成的，其余是广播。

```
第 1 回合       game_start
第 2 回合起     上一回合结束 8 秒后：phase_change(new_round)

加密            phase_change(encrypting)        加密者收到密码，其余人 waiting
                player_progress …               真人加密者每行是否有字
                ai_thinking / ai_acted …        AI 加密者逐条作答
                [真人] clues_submitted

拦截（N ≥ 3）   phase_change(intercept)         所有人收到线索，对手行动
                player_progress … / ai_thinking / ai_acted …
                round_result(intercept_success)
                停顿 4 秒

解码            phase_change(decrypt)           所有人收到线索，加密者的队友行动
                player_progress … / ai_thinking / ai_acted …
                round_result(decrypt_success)

结束            round_result(complete, history)
                对局结束时紧接着：game_over
```

任何阶段时间用尽：`timeout`，然后照常进入该阶段后面的消息。

### 再来一局

```
reopen_room  →  room_state（房间，started 为 false）
```

页面停在结束画面，直到这位玩家自己选择回到大厅。

## 断线与重启

### 页面一侧

- 连接意外断开后自动重连，间隔为 1 秒、2 秒、4 秒、8 秒，之后每 10 秒一次；连上后间隔复位。
- 恢复令牌与房间码保存在 `sessionStorage`（键 `decrypto-session-v1`），刷新页面后仍在，关闭标签页后不再保留。
- 设备令牌保存在 `localStorage`（键 `decrypto-device-v1`），首次进房时生成，长期保留。存储不可用时不发送设备令牌。
- 每次连上，只要手里有房间码与恢复令牌，页面就发 `resume_room`。

### 恢复的过程

```
resume_room  →  room_resumed（本人）
             →  room_state（房间，该玩家不再标记为离线）
             →  full_sync（本人）
```

恢复被拒绝时收到 `code` 为 `resume_expired` 的 `error`，页面清除保存的座位并回到首页。

### 服务端一侧

- 断线的座位保留 20 秒；房间在没有任何真人在线 10 分钟后关闭。详见[后端架构](architecture.md)的"房间"一节。
- 服务端只保存恢复令牌与设备令牌的 SHA-256。数据库里的内容不能用来冒充某位玩家或某个浏览器。
- 服务重启后，页面照常重连并发 `resume_room`。恢复令牌仍然有效。被打断的对局在第一位真人回来时从原阶段重新开始：所有在线的人收到带有新截止时间的 `phase_change`，已结算的拦截与解码不会重来。
- 尚未提交的草稿不随重启保留在服务端；页面自己留着已写的线索。

## 协议守住的隐私

- **密码**只发给本回合的加密者。其他人要到回合结束、这一行进入 `history` 时才看到。
- **关键词**只发给本队。对方的关键词直到 `game_over` 才公开。
- **线索的文字**在发出之前不离开服务端：`progress` 里的草稿只用于超时代发，`player_progress` 里只有"哪几行已有字"。
- **恢复令牌**只发给本人，**设备令牌**只由页面发给服务端；两者都不出现在发给他人的任何消息里。
- **没有座位的成员**收不到任何一队的关键词。

`player_progress` 里的 `guesses` 是向整个房间广播的，包括拦截阶段对手正在选的数字。不让尚未解码的一队看到这些数字，是页面在显示时做的取舍，协议本身并不隐藏。
