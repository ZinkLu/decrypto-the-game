# Opponent Waiting — 对手窃听

> 页面组件: `OpponentWaiting.tsx`
> 游戏阶段: `encrypting`
> 角色: `opponent`（对方队伍）

## 页面用途

加密阶段中，对方队伍处于"窃听"状态。页面以 **3 行截获列表** 形式逐一映射加密者的 3 个线索槽——每行一个状态（扫描中 / 截获中 / 已截获），在空间上与 `Encryptor` 和 `TeammateWaiting` 1:1 对应，保持三页视觉节奏一致。

## 页面信息

- **倒计时** — 90 秒（与加密者共享同一计时），`theme="opponent"`（红色 CRT）
- **截获标记** — 顶部 `INTERCEPTED TRANSMISSION` 红色印章
- **未知身份 (紧凑横排)** — 小型 CRT 方框 `?` + `RedactedText` 乱码身份，横向并列
- **截获状态列表** — `max-w-lg` 容器内 3 行：
  - 左 3px 彩色边框（按三态换色）
  - 标签列 `INTERCEPT #N` + 状态大写字样（`SCANNING` / `INCOMING` / `CAPTURED`）
  - 箭头 `→`
  - 48×48 CRT 风格方框，内嵌 emoji 状态图示
  - 状态文字（斜体/打字点 / `INTERCEPTED` 大写 / `tracking` 等）
  - completed 行末尾红色 `◉` 锁定标
- **计数** — 列表顶部 `INTERCEPT FEED [n/3]`
- **Agent 面板** — 底部敌方 mascot 文案

## 槽位三态

由加密者广播的 `player_progress` 推导（`state` / `step` / `focus`）：

| 槽位状态 | 判定 | 视觉 |
|---|---|---|
| `waiting` | 非正在编辑、未被完成 | 🔍 放大镜，`slot-idle-breathe` 呼吸；暗红左边框 `opponentNormalBorder`；"listening..." 斜体 |
| `active` | `editing` 且 `index === focus` | 📡 天线 `slot-active-jiggle` 抖动；红色 `intercept-alarm` 1s 报警边框；内嵌红色阴影；三点 `typing-dot` + `TRACKING` 标签 |
| `completed` | `submitted` 或 `index <= step` | 🔒 锁 `slot-completed-seal` 一次性盖章；红色偏亮边框；"INTERCEPTED" 大写电报字样；右侧红色 ◉ |

## AI 兼容

AI 加密者通过 `ai_thinking` 事件广播 `step=N`。前端 `useEncryptProgress()` 把 AI 事件翻译为 `{phase: 'editing', step: N-1, focus: N}`，与人类的三态模型共用。

## 张力变化

外层页面保留 4 级张力（normal → warning → tense → critical）随倒计时推进；张力影响背景色和 `RedactedText` 乱码刷新速度，不覆盖槽位三态。

## 用户操作

无。本页面为纯观察页面。

## 状态流转

- 前置: `phase_change` 消息中 `phase=encrypting` 且 `your_role=opponent`
- 后续: 加密完成后收到 `phase_change`，进入 **OpponentAnalyzing（对手分析）**

## Store 交互

- 读取: `encryptor`, `round`, `aiStatus`, `playerProgress`
- 写入: 无

## 后续优化（未实施）

当前状态图示使用 emoji 做过渡方案，后续计划替换为共享的 `<SignalOscilloscope>` Canvas 2D 组件（CRT 磷光示波器），通过三态波形（无信号/入站信号/锁定）强化冷战谍战氛围。届时 `TeammateWaiting` 会共用同一组件，仅切换主题色（友方绿磷 / 敌方琥珀）。
