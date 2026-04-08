# Opponent Waiting — 对手窃听

> 页面组件: `OpponentWaiting.tsx`
> 游戏阶段: `encrypting`
> 角色: `opponent`（对方队伍）

## 页面用途

加密阶段中，对方队伍处于"窃听"状态。页面营造紧张的截获氛围，展示乱码文档和信号强度，暗示正在拦截对方通讯。

## 页面信息

- **倒计时** — 90 秒（与加密者共享同一计时）
- **截获标记** — 页面顶部显示「INTERCEPTED TRANSMISSION」标记
- **未知身份** — 加密者身份显示为「?」和「UNKNOWN」
- **乱码文档** — 3 个文档卡片显示随机字符网格（模拟加密通讯截获），字符按张力等级加速刷新
- **信号强度计** — 随机信号条，模拟无线电截获信号的不稳定

## 用户操作

无。本页面为纯观察页面。乱码文档和信号强度计自动运行，无交互元素。

## 张力变化

随着倒计时推进，页面整体氛围逐步升级（4 个等级：normal → warning → tense → critical），乱码刷新速度加快，信号更不稳定。

## 状态流转

- 前置: `phase_change` 消息中 `phase=encrypting` 且 `your_role=opponent`
- 后续: 加密完成后收到 `phase_change`，进入 **OpponentAnalyzing（对手分析）**

## Store 交互

- 读取: `encryptor`, `round`
- 写入: 无
