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

## 选择器示波器三态

| 状态 | 判定 | 视觉 |
|---|---|---|
| `waiting` | 队友未聚焦且未填此槽 | 光束在 4 行之间缓慢正弦漂移 + `SCAN` 角标 |
| `thinking` | 队友聚焦此槽、未填 | 光束在 4 行间随机快速跳跃（~180ms 一次）+ `EVAL` 角标 |
| `locked` + `correct` | 已填且 = 正确答案 | 光束稳定在该行、绿色高亮 + 底层绿色 tint 条 + `MATCH` 角标 + 左侧数字标签 |
| `locked` + `wrong` | 已填且 ≠ 正确答案 | 光束在该行、**红色**发光 + 底层红色 tint + 正确档位上绿色虚线"幽灵" + `MISS` 角标 |

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
