# Round Result — 回合结算

> 页面组件: `RoundResult.tsx`
> 游戏阶段: `round_result`
> 角色: 无（所有玩家可见）

## 页面用途

展示本轮结果。根据拦截和解码情况显示不同的结果标记，并更新积分。

## 页面信息

- **轮次编号** — 「第 N 轮结果」
- **结果标记** — 根据情况显示不同标记：
  - `INTERCEPTED` — 对方拦截成功（`intercept_success === true`）
  - `DECRYPT FAIL` — 己方解码失败（`decrypt_success === false`）
  - `DECODED` — 解码成功，无拦截（`decrypt_success === true`，无拦截结果）
  - `SECURE` — 解码成功且对方拦截失败（`decrypt_success === true && intercept_success === false`）
  - `PROCESSING` — 等待服务端结果时的过渡状态
- **积分板** — 两队积分对照：
  - 队伍名称（ALPHA / BRAVO）
  - 拦截次数（X/2）
  - 解码失误次数（X/2）
- **提示** — 「下一轮即将开始…」

## 用户操作

无。本页面为纯展示页面，自动跳转到下一轮。

## 胜负判定

积分板中任一项达到 2 即触发游戏结束：
- 拦截 2 次 = 该队获胜
- 对方解码失误 2 次 = 己方获胜

## 状态流转

- 前置: 收到 `round_result` 消息
- 后续 A: 未达到胜负条件 → 自动进入下一轮的 **加密阶段**
- 后续 B: 达到胜负条件 → 进入 **GameOver（游戏结束）**

## Store 交互

- 读取: `roundResult`, `round`, `scoreA`, `scoreB`
- 写入: 无
