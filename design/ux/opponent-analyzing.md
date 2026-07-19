# Opponent Analyzing — 对手分析

> 页面组件: `OpponentAnalyzing.tsx`
> 游戏阶段: `decrypt`
> 角色: `opponent`（对方队伍）

## 页面用途

对手队伍在解码阶段分析线索，决定是否发起拦截。这是对手视角的决策页面。

## 页面信息

- **倒计时** — 90 秒
- **INTELLIGENCE ANALYSIS** 标题字
- **截获解码列表** — `max-w-lg` 容器内 3 行，**布局与 `OpponentWaiting` 的 Intercept 列表 1:1 对齐**（同一容器宽度 / 同一列宽 / 同一行高），整个加密→分析阶段用同一套视觉节奏：
  - 左 3px 彩色边框（按三态换色）
  - 标签列（~110px 宽）：`CLUE #N` + 敌方红色线索词 `"xxx"`
  - **`<SelectorOscilloscope>`** 104×48，敌方主题（琥珀 phosphor），**与 `OpponentWaiting` 使用同一组件实例、同一视觉底子**
  - 状态文字（`scanning...` / `evaluating...` / `intercepted`）
  - `locked` 行末尾红色 `◉`
  - 列表顶部右侧计数 `n/3 LOCKED`
- **情报表** — 历史轮次汇总表格（位置保持在列表下方，独立区块）：
  - 轮次编号
  - 线索词（可点击高亮）
  - 已知的密码序列

## 槽位三态（复用加密阶段示波器底子）

与 `OpponentWaiting` 共用同一示波器组件和"仪器外壳"：dot grid graticule + 中心十字 + phosphor persistence + scanlines + vignette + chromatic aberration。仪器外壳在三态中不变，只切换屏幕内容——原先的波形换成 **CRT 雪花屏**，最终锁定时屏幕中央浮现一个大号琥珀 phosphor 数字（示波器里的"读数"）。

### 设计原则：未锁定 = 持续扰动

`waiting` / `thinking` 任意一帧都不能让屏幕看起来"静止"。雪花屏本身（per-frame 重新随机）+ 扫描带 + 亮度抖动构成持续扰动。**只有 `locked` 才允许屏幕进入安定**，且必须经过过渡动画——视觉上等同于"信号被锁住、噪声平静下来、数字从混沌中浮现"。

### 状态表

| 槽位状态 | 判定 | 屏幕内容 | 角标 |
|---|---|---|---|
| `waiting` | 敌队尚未触碰该槽 | 低密度琥珀雪花屏（底噪），整帧持续扰动 | `SCAN` |
| `thinking` | 敌队 `focus === i+1` / AI 正处理该槽 | 高密度琥珀雪花屏 + **下行扫描亮带**（缓慢、带 alpha 衰减、有机感不僵硬）| `EVAL` |
| `locked` | 敌队已填入该位 | 经过约 ~400ms 过渡动画收敛后：雪花降到 floor + 中央大号琥珀 phosphor 数字（对手已选的数字）| `LOCK` |

### 锁定过渡动画（thinking → locked）

与 `EncryptorWatching` 共用同一过渡逻辑（约 350–500ms）：噪点收敛 + 数字 alpha 浮现伴随 ±1px vertical jitter + chromatic aberration 从乱跳收敛到 ±0.9px。过渡后保留约 1.5% 亮度抖动 + ~2% 噪点 floor 持续刷新，避免 locked 看起来死寂。

**本页面不显示对错**——只观察敌队锁定了什么数字（不带 correct/wrong 着色），正误留到 `RoundResult` 揭晓。

## 用户操作

1. **观察解码进度** — 三行截获列表实时显示敌队对每条线索的选择与锁定状态
2. **分析线索** — 查看当前轮次线索和历史情报
3. **高亮关键词** — 点击情报表中的线索词，同名词在所有历史行中同步高亮/取消高亮

## 数据源

读取 `playerProgress.guesses`（敌队解码者广播的猜测数组，0 = 未填）:
- `guesses[i] > 0` → locked，显示该数字
- `focus === i+1` 或 `aiStatus.step === i+1` → thinking
- 否则 waiting

**注**：这里"对手"从己方视角出发，但该页面实际由对方队伍观察己方解码者。guesses 来源是**该页面玩家所属队伍的对手的解码者**广播。

## 状态流转

- 前置: `phase_change` 消息中 `phase=decrypt` 且 `your_role=opponent`
- 后续: 解码判定完成后进入 **RoundResult（回合结算）**

## Store 交互

- 读取: `clues`, `history`, `round`, `playerProgress`, `aiStatus`
- 写入: 无
