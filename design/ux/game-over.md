# Game Over — 游戏结束

> 页面组件: `GameOver.tsx`
> 游戏阶段: `game_over`
> 角色: 无（所有玩家可见）

## 页面用途

展示最终游戏结果——哪队获胜、最终积分、并提供返回首页的操作。

## 页面信息

- **结果标记** — 根据结果显示不同标记：
  - `MISSION COMPLETE` — 己方获胜
  - `COMPROMISED` — 己方失败
  - `STALEMATE` — 平局
- **结果标题** — 对应中文描述：
  - 胜利: 「VICTORY」
  - 失败: 「DEFEAT」
  - 平局: 「MISSION INCONCLUSIVE」
- **胜方说明** — 显示获胜队伍名称
- **最终积分** — 两队积分卡片：
  - 队伍名称（ALPHA / BRAVO）
  - 总拦截次数（0-2）
  - 总解码失误次数（0-2）
- **返回按钮** — 「RETURN TO BASE」

## 用户操作

1. **查看结果** — 浏览最终积分和结果（被动）
2. **返回首页** — 点击「RETURN TO BASE」按钮重置游戏状态，返回 Home 页面

## 胜负判定逻辑

- 己方获胜: `gameOver.winner` 等于己方队伍标识
- 己方失败: `gameOver.winner` 等于对方队伍标识
- 平局: `gameOver.winner === null`

## 状态流转

- 前置: 收到 `game_over` 消息
- 后续: 点击返回按钮后调用 `reset()`，断开 WebSocket，返回 **Home（首页）**

## Store 交互

- 读取: `gameOver`, `scoreA`, `scoreB`, `myTeam`
- 写入: `reset()`
