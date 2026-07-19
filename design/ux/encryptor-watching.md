# Encryptor Watching — 加密者观战

> 页面组件: `EncryptorWatching.tsx`
> 游戏阶段: `decrypt`
> 角色: `encryptor`（当前轮次的加密者）

## 页面用途

加密者以"上帝视角"观看队友的解码过程。可以看到正确答案，并通过每行的**选择器示波器**实时查看队友的猜测：哪个槽在思考、哪个已选、以及是否命中。

## 页面信息

- **倒计时** — 90 秒（与队友解码共享同一计时）
- **"Teammate decoding..."** 状态字
- **正确答案卡** — 固定显示正确的密码序列（仅加密者可见），标注「仅你可见」
- **线索行列表** — 3 行，**布局与 `TeammateWaiting` 的 Intel 列表对齐**（同一容器宽度 / 同一列宽 / 同一行高），方便玩家从加密阶段顺滑切入解密观察：
  - 左 3px 彩色边框（按四态换色：暗 brass → brass → 绿 → 红）
  - 标签列（~110px 宽）：`CLUE #N` + 线索词 `"xxx"`
  - **`<SelectorOscilloscope>`** 104×48，**与 `TeammateWaiting` 使用同一组件实例、同一视觉底子**
  - 状态文字（`match — decoded ✓` / `miss — was X` / `thinking…` / `not yet…`）
- **任务报告弹窗** — 所有猜测完成后弹出 3 秒自动关

## 选择器示波器视觉（复用加密阶段示波器底子）

与 `TeammateWaiting` / `OpponentWaiting` 共用同一示波器组件和"仪器外壳"：dot grid graticule + 中心十字 + phosphor persistence（余晖）+ scanlines + vignette + chromatic aberration。**仪器外壳在四态中完全不变，只有屏幕内容切换**，保留"同一台设备在不同工况下显示不同结果"的连贯叙事。

屏幕内容由原先的波形改为 **CRT 雪花屏（snow static）**；最终锁定时，雪花收敛、屏幕中央浮现一个大号 phosphor 数字——这是示波器里的"读数"，不再是波形 trace。

### 设计原则：未锁定 = 持续扰动

`waiting` / `thinking` 两态在任意一帧都不能让屏幕看起来"静止"或"安宁"。雪花屏本身（per-frame 重新随机）就是基础扰动；扫描带、亮度抖动、graticule 的微弱呼吸是叠加扰动手段。**只有 `locked` 才允许屏幕进入安定**，且必须经过过渡动画从扰动渡过去——视觉上等同于"信号被锁住、噪声平静下来、数字从混沌中浮现"。

### 状态表

| 状态 | 判定 | 屏幕内容 | 角标 |
|---|---|---|---|
| `waiting` | 队友尚未触碰该槽 | 低密度雪花屏（底噪），整帧持续扰动 | `SCAN` |
| `thinking` | `focus === i+1` 或 AI 正处理该槽 | 高密度雪花屏（噪点翻倍）+ **下行扫描亮带**（缓慢、带 alpha 衰减、有机感不僵硬）| `EVAL` |
| `locked` + `correct` | 已填且 = 正确答案 | 经过约 ~400ms 过渡动画收敛后：雪花降到 floor + 中央**绿色**大号 phosphor 数字（多层 bloom + 微闪 + 色差残留）| `MATCH` |
| `locked` + `wrong` | 已填且 ≠ 正确答案 | 同上过渡 + 中央数字转**红色** + 右侧小号"→N"绿色幽灵数字（正确答案）| `MISS` |

### 锁定过渡动画（thinking → locked）

约 350–500ms，分三阶段重叠：
1. **噪点收敛**：雪花密度从 thinking 的 ~18% 沿 ease-out 曲线衰减到 locked floor (~3%)
2. **数字浮现**：phosphor 数字 alpha 从 0 升到 1，伴随轻微 vertical jitter（±1px 抖动），像辉光管点亮
3. **色差残留稳定**：chromatic aberration 偏移量从轻度乱跳收敛到固定值 ±0.9px，bloom 半径从大到小回落

过渡完成后留一个**不息的微闪**（约 1.5% 亮度抖动 + ~2% 噪点 floor 持续刷新），保留"仪器还在通电"的活体感——locked 不等于死寂。

## 数据源

读取 `playerProgress.guesses` (数组 `[d1,d2,d3]`，0 = 未填) 推导各行状态：
- `guesses[i] > 0` → locked，与 `secretDigits[i]` 比对出 correct/wrong
- `focus === i+1` 或 `aiStatus.step === i+1` → thinking
- 否则 waiting

## 状态流转

- 前置: `phase_change` 消息中 `phase=decrypt` 且 `your_role=encryptor`
- 后续: 判定完成后进入 **RoundResult（回合结算）** 或 **InterceptedWaiting**

## Store 交互

- 读取: `clues`, `secretDigits`, `round`, `playerProgress`, `aiStatus`
- 写入: 无
