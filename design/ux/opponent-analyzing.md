# Opponent Analyzing — 对手分析

> 页面组件: `OpponentAnalyzing.tsx`
> 游戏阶段: `decrypt`
> 角色: `opponent`（对方队伍）

## 页面用途

对手队伍在解码阶段分析线索，决定是否发起拦截。这是对手视角的决策页面。

## 页面信息

- **倒计时** — 90 秒
- **INTELLIGENCE ANALYSIS** 标题字
- **当前线索** — 本轮加密者给出的 3 条线索词
- **Enemy Decode Feed**（新）— 一排 3 个**敌方主题**的 `<SelectorOscilloscope>`（琥珀辉光管风格），每个对应一条线索，实时反映敌队解码者的选择：
  - 任何非 locked 状态（waiting / thinking）：数字 1→2→3→4 循环切换，`SCAN` / `EVAL` 角标区分
  - locked: 琥珀辉光数字稳定显示，`LOCK` 角标
  - 顶部计数 `n/3 LOCKED`
- **情报表** — 历史轮次汇总表格，每行包含：
  - 轮次编号
  - 线索词（可点击高亮）
  - 已知的密码序列

## 用户操作

1. **观察解码进度** — Enemy Decode Feed 实时显示敌队对 3 条线索的选择
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
