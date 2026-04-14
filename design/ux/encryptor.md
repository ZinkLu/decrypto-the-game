# Encryptor — 加密者输入线索

> 页面组件: `Encryptor.tsx`
> 游戏阶段: `encrypting`
> 角色: `encryptor`（当前轮次的加密者）

## 页面用途

加密者收到 3 个密码序号，需要为每个序号对应的词给出 1 条线索。这是加密阶段的核心交互。

布局与 `TeammateDecoding` 保持镜像对称：顶部以"密码词参考栏"展示己方全部 4 个密码词，下方依次列出 3 个线索输入槽；焦点落在哪个槽上，顶部对应编号的密码词就会高亮。

## 页面信息

- **倒计时** — 90 秒限时，带进度条
- **密码词参考栏** — 顶部一排展示 4 个密码词（按图钉风格卡片），当前正在编写的线索对应的密码词以绿色高亮，其余保持常规色
- **线索输入槽（×3）** — 垂直列出 3 个槽，每个槽同屏显示：
  - `INTEL #N` 标签
  - `<密码序号>. <密码词>`（加密目标）
  - 线索输入框（最长 8 字符，过滤特殊字符）
  - 已填写则左侧出现绿色 ✓
- **进度标题** — 槽列表上方展示 `COMPOSE INTEL [n/3]`
- **紧急提示** — 剩余时间不足时出现 URGENT 印章
- **历史记录** — 点击 `[PAST INTEL LOG]` 展开抽屉，查看过往轮次的线索-密码对照
- **提交按钮** — 3 个槽全部填写后底部出现 `DISPATCH INTEL`

## 用户操作

1. **切换焦点** — 点击任一线索槽将该槽置为焦点，顶部对应的密码词随之高亮
2. **输入线索** — 在焦点槽的输入框中为对应目标词输入线索词
3. **查看历史** — 点击 `[PAST INTEL LOG]` 展开历史抽屉
4. **提交线索** — 3 个槽全部填写后点击 `DISPATCH INTEL`，提交全部 3 条线索

## 用户流程

```
看到 4 个密码词参考 + 3 个待填线索槽（#1 默认聚焦，对应密码词高亮）
→ 输入线索 #1 → 点击槽 #2（高亮切到新目标词）
→ 输入线索 #2 → 点击槽 #3
→ 输入线索 #3 → 出现 DISPATCH INTEL
→ 提交
```

## 状态流转

- 前置: `phase_change` 消息中 `phase=encrypting` 且 `your_role=encryptor`
- 后续: 提交后进入解密阶段，本人转为 **EncryptorWatching（加密者观战）**
- 超时: 未在限时内提交的处理由服务端决定

## 进度广播

加密者向队友 (`TeammateWaiting`) 和对手 (`OpponentWaiting`) 实时广播三态进度，用于驱动对方页面的槽位动画、缓解等待焦虑。

事件载荷：

```ts
sendProgress('encrypt', step, { state, focus })
// state:  "idle" | "editing" | "submitted"
// step:   已完成格子数量 0-3
// focus:  正在编辑的槽位 1-3，state 非 editing 时为 0
```

广播时机：

| 时机 | 载荷 |
|---|---|
| 页面挂载 | `{ state: 'idle', step: 0, focus: 0 }` |
| 第一次点击任一槽 / 后续切换焦点 | `{ state: 'editing', step: <filledCount>, focus: <N> }` |
| 输入或清空某格（filledCount 变化） | 同上，携带新 step |
| 按 DISPATCH INTEL | `{ state: 'submitted', step: 3, focus: 0 }` |

关键点：默认 `focusedClue=0`、`hasInteracted=false`，直到玩家第一次点击槽位才转为 `editing`，避免把"刚进入页面"和"正在编辑 #1"混为一谈。

## Store 交互

- 读取: `secretDigits`, `secretWords`, `myWords`, `history`
- 写入: `submitClues(clues[3])`, `sendProgress('encrypt', step, { state, focus })`
