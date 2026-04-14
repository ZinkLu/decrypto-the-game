# Opponent Waiting — 对手窃听

> 页面组件: `OpponentWaiting.tsx`
> 游戏阶段: `encrypting`
> 角色: `opponent`（对方队伍）

## 页面用途

加密阶段中，对方队伍处于"窃听"状态。页面营造紧张的截获氛围——3 个乱码文档实时镜像加密者的 3 个线索槽（闲置扫描 / 正在截获 / 已捕获），辅以身份未知提示和信号强度计，暗示正在拦截对方通讯。

## 页面信息

- **倒计时** — 90 秒（与加密者共享同一计时）
- **截获标记** — 页面顶部显示「INTERCEPTED TRANSMISSION」标记
- **未知身份** — 加密者身份显示为「?」和「UNKNOWN」，附带随时间变化的乱码文字
- **3 个乱码文档** — 逐一对应加密者的 3 个线索槽，按当前状态展示不同视觉（见下方"槽位三态"）
- **信号强度计** — 底部随机信号条，`activity = low / mid / high` 随加密者三态调整刷新速度

## 槽位三态

槽位状态由加密者广播的 `player_progress` 推导（`state` / `step` / `focus`）：

| 槽位状态 | 判定 | 视觉 |
|---|---|---|
| `waiting` | 当前未被编辑、尚未被完成 | 字符缓慢刷新（400–500ms），暗红边 `opponentNormalBorder`，标签 `SCANNING` |
| `active` | `editing` 且 `index === focus` | 字符快速刷新（60–90ms），红边 `intercept-alarm` 1s 报警闪烁 + 内外红光，标签 `INCOMING` |
| `completed` | `submitted`，或 `index <= step` | 字符冻结，半透明暗色覆盖，中心一次性 `intercept-stamp`（0.55s）盖章显示 `INTERCEPTED`；边框红，标签 `CAPTURED` |

## AI 兼容

AI 加密者通过 `ai_thinking` 事件广播 `step=N`。前端 `useEncryptProgress()` 把 AI 事件翻译为 `{phase: 'editing', step: N-1, focus: N}`，与人类的三态模型共用。

## 张力变化

外层页面仍保留 4 级张力（normal → warning → tense → critical）随倒计时推进；张力只影响 waiting 状态的字符刷新节奏和整体配色，不覆盖槽位三态。

## 用户操作

无。本页面为纯观察页面。

## 状态流转

- 前置: `phase_change` 消息中 `phase=encrypting` 且 `your_role=opponent`
- 后续: 加密完成后收到 `phase_change`，进入 **OpponentAnalyzing（对手分析）**

## Store 交互

- 读取: `encryptor`, `round`, `aiStatus`, `playerProgress`
- 写入: 无
