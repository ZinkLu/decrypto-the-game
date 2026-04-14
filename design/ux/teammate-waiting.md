# Teammate Waiting — 队友等待加密

> 页面组件: `TeammateWaiting.tsx`
> 游戏阶段: `encrypting`
> 角色: `teammate`（加密者的队友）

## 页面用途

加密者正在编写线索时，队友在此等待。页面通过 3 个信箱格实时映射加密者每个线索槽的状态（闲置 / 正在输入 / 已完成），把"干等"变成"能看到对方在动"，缓解等待焦虑。

## 页面信息

- **倒计时** — 90 秒（与加密者共享同一计时）
- **加密者信息** — 显示加密者昵称，标注「正在编写情报」
- **3 个信箱格** — 逐一对应加密者的 3 个线索槽，按当前状态展示不同视觉（见下方"槽位三态"）
- **完成计数** — 底部小字显示 `[n/3]`
- **状态文字** — 根据当前阶段更新 Agent 面板文案（`Awaiting transmission...` → `<name> is drafting...` → `First intel received!` → ... → `All intel received!`）

## 槽位三态

槽位状态由加密者广播的 `player_progress` 推导（`state` / `step` / `focus`）：

| 槽位状态 | 判定 | 视觉 |
|---|---|---|
| `waiting` | 当前未被编辑、尚未填写（`idle` 阶段全部；`editing` 阶段非 focus 非已填写） | 📪 灰色闭合信箱，`slot-idle-breathe` 2.4s 呼吸透明度；深 navy 底 |
| `active` | `editing` 且 `index === focus` | 📨 brass 边框，`slot-active-jiggle` 轻微抖动，`slot-active-glow` 1.2s 脉冲光晕；下方三点 `typing-dot` 错相位跳动 |
| `completed` | `submitted`，或 `index <= step` | 📄 + 绿色 ✓，进入时一次性 `slot-completed-seal`（0.6s 盖章）+ `slot-completed-glow`（1.4s 光晕），之后静止 |

## AI 兼容

AI 加密者通过 `ai_thinking` 事件广播 `step=N`（"正在处理第 N 个"）。前端 `useEncryptProgress()` 把 AI 事件翻译为 `{phase: 'editing', step: N-1, focus: N}`，与人类的三态模型共用。

## 用户操作

无。本页面为纯观察页面，没有可交互元素。

## 状态流转

- 前置: `phase_change` 消息中 `phase=encrypting` 且 `your_role=teammate`
- 后续: 加密完成后收到 `phase_change` 进入 **TeammateDecoding（队友解码）**

## Store 交互

- 读取: `encryptor`（昵称）, `round`, `aiStatus`, `playerProgress`
- 写入: 无
