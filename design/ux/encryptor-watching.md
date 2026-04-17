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
- **线索行列表** — 3 行，每行：
  - `CLUE #N` 标签 + 线索词 `"xxx"`（固定 110px 宽）
  - **`<SelectorOscilloscope>`** 选择器示波器 104×48：Y 轴量化到 4 档 = 数字 1-4
  - 状态文字（`match — decoded ✓` / `miss — was X` / `thinking…` / `not yet…`）
  - 左边框色随状态（绿 / 红 / 暗 brass）
- **任务报告弹窗** — 所有猜测完成后弹出 3 秒自动关

## 选择器示波器三态（辉光管数字风格）

示波器里直接显示 phosphor 辉光的大号数字（Bebas Neue + 多层 shadowBlur），模拟冷战时期 nixie tube（辉光管）的气体放电显示效果。

| 状态 | 判定 | 视觉 |
|---|---|---|
| `waiting` | 队友未聚焦且未填此槽 | 水平扫描线 + 微噪点漂移 + `SCAN` 角标 |
| `thinking` | 队友聚焦此槽、未填 | 数字 1→2→3→4 循环切换（~220ms/档，末段有 crossfade）+ 其他数字以 8% 透明度作"阴极叠影" + `EVAL` 角标 |
| `locked` + `correct` | 已填且 = 正确答案 | 数字稳定辉光显示（绿色三层 bloom）+ 微微闪烁 + `MATCH` 角标 |
| `locked` + `wrong` | 已填且 ≠ 正确答案 | 数字**红色**辉光 + 右侧小号"→N"绿色幽灵数字（正确答案）+ `MISS` 角标 |

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
