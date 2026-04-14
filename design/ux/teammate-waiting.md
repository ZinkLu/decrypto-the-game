# Teammate Waiting — 队友等待加密

> 页面组件: `TeammateWaiting.tsx`
> 游戏阶段: `encrypting`
> 角色: `teammate`（加密者的队友）

## 页面用途

加密者正在编写线索时，队友在此等待。页面以 **3 行列表** 形式逐一映射加密者的 3 个线索槽——每行一个状态（闲置 / 正在输入 / 已完成），在空间上与 `Encryptor` 的线索列表 1:1 对应，便于玩家快速建立位置映射、缓解等待焦虑。

## 页面信息

- **倒计时** — 90 秒（与加密者共享同一计时）
- **加密者信息** — 显示加密者昵称，标注「正在编写情报」
- **情报状态列表** —`max-w-lg` 容器内 3 行：
  - 左 3px 彩色边框（按三态换色）
  - 标签列 `INTEL #N` + 状态大写字样（`WAITING` / `INCOMING` / `RECEIVED`）
  - 箭头 `→`
  - 48×48 状态方框，内嵌 emoji 状态图示
  - 状态文字或打字中三点指示器
  - completed 行末尾绿色 `✓`
- **完成计数** — 列表顶部右侧 `INCOMING INTEL [n/3]`
- **Agent 面板** — 底部 mascot emoji + 文案（随阶段变化）

## 槽位三态

由加密者广播的 `player_progress` 推导（`state` / `step` / `focus`）：

| 槽位状态 | 判定 | 视觉 |
|---|---|---|
| `waiting` | 非正在编辑、未填写（`idle` 阶段全部） | 示波器（绿磷）显示近平线 + 微噪点 + 偶发小 blip，`NO SIG` 角标；暗 brass 左边框；"awaiting transmission" 斜体 |
| `active` | `editing` 且 `index === focus` | 示波器显示包络化数据包正弦 + 横扫光束 + 色差 + 余晖，`TRACK` 角标；brass 左边框；整行 `slot-active-glow` 1.2s 脉冲；三点 `typing-dot` 指示 |
| `completed` | `submitted` 或 `index <= step` | 示波器显示冻结的钟形捕获波形 + 中心脉冲锁定环 + `LOCK` 角标 + `◉` 徽标；绿边；一次性 `slot-completed-glow`；"intel secured" + 右侧 ✓ |

状态图示由共享组件 `SignalOscilloscope` 渲染（Canvas 2D，`theme="friendly"` 绿磷光），含 phosphor 余晖、scanlines、色差、vignette。零依赖。

## AI 兼容

AI 加密者通过 `ai_thinking` 事件广播 `step=N`（"正在处理第 N 个"）。前端 `useEncryptProgress()` 把 AI 事件翻译为 `{phase: 'editing', step: N-1, focus: N}`，与人类的三态模型共用。

## 用户操作

无。本页面为纯观察页面，没有可交互元素。

## 状态流转

- 前置: `phase_change` 消息中 `phase=encrypting` 且 `your_role=teammate`
- 后续: 加密完成后收到 `phase_change` 进入 **TeammateDecoding（队友解码）**

## Store 交互

- 读取: `encryptor`, `round`, `aiStatus`, `playerProgress`
- 写入: 无
