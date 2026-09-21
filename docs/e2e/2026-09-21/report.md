# Decrypto 端到端测试报告

测试日期：2026-09-21（Asia/Shanghai）。被测提交：`0c96fab`。使用生产构建、真实 Go server、两个独立浏览器页面和真实本地模型；没有修改应用实现。

## 设计反模式判断

**通过：整体有明确的桌游密码机风格，不是通用卡片后台模板。** 机身、名牌、纸带和仪表的设计方向一致。CRT 发光服务于实体终端主题。主要问题集中在游戏状态、等待提示和手机操作，不建议为解决这些问题重做视觉风格。

## 结论

正常主流程能完成，但目前还不能认为联机与 AI 链路足够稳健。记录 **11 项问题：6 项高优先级（P1）、5 项中优先级（P2）**。最先处理服务端操作校验、旁观者秘密词泄露、断线恢复和 AI 失败处理。

- 浏览器房间 `R8MP`：A 队两位真人测试账号，B 队两位真实 AI。00:09:12 开局，00:17:58 第六轮 A 队第二次拦截成功，正常显示获胜，两端最终比分一致。总时长约 8 分 46 秒，包含人工检查和输入时间，不代表自动游戏的纯耗时。
- 协议测试：四个真实 WebSocket 客户端完成 16 轮，117.145 秒后以平局结束。
- 另一协议测试：A 队在第一、第三轮解密失败，第三轮结束时 B 队获胜，13.016 秒。
- 刷新测试房间 `8Z6T`：开局后刷新返回首页；使用同昵称、原房间码重新加入，被告知“该房间的行动已经开始，请加入其他房间”。

## 环境与验证结果

| 项目 | 结果 |
|---|---|
| 后端构建 | `go build -o /tmp/decrypto-e2e-server ./cmd/server` 成功 |
| 前端测试 | `pnpm test`：65/65 通过 |
| 前端生产构建 | `pnpm build` 成功；主 Console chunk 994.94 kB，gzip 308.89 kB，存在体积警告 |
| 房间与 WS 测试 | `go test ./internal/room ./internal/ws` 通过 |
| 竞争检测 | 上述两包的 `go test -race` 通过；不等于完整线上消息处理没有竞争 |
| 静态检查 | `go vet ./cmd/server ./internal/ai/... ./internal/game ./internal/server ./internal/room ./internal/ws` 通过 |
| 核心测试 | 编译为测试二进制后，从仓库根目录运行通过；原 `go test ./...` 因包目录没有 `words.txt` 而失败 |
| 浏览器 | Codex 内置浏览器，桌面 1237×964 / 1280×720；手机视口 390×844 |
| 页面错误 | 主测试页面未捕获到 JS error；有 Three.js 阴影类型弃用 warning |
| 模型 | `http://100.126.37.75:8888/v1`，`unsloth/Qwen3.8-27B-GGUF`，真实调用 |

模型密钥仅通过启动进程的环境变量传入，没有写入报告、脚本或项目配置。测试服务在完成后已停止。

### 实际覆盖

创建房间、复制房间码动作、错误房间码、大小写规范化、加入房间、选择队伍、增加/移除 AI、人数不足时禁用开始、非房主权限、开始游戏、双方秘密词与加密者权限、真人线索输入、重复数字限制、角色轮换、真人/AI 拦截、真人/AI 解密、计分、历史纸带、语言切换保留输入、三种结束条件、结束后返回首页、手机横向操作、刷新后重新加入。

另以独立房间验证未选队玩家、非法输入、跨阶段提交、满员换队、重复开局和房主离线。协议客户端的猜测使用测试夹具控制，用于验证状态机；不作为 AI 能力测试。

## AI 链路耗时与失败

| 回合与动作 | 开始 → 结束 | 三步合计 | 结果 |
|---|---|---:|---|
| 第 2 轮 AI 加密 | 00:09:47 → 00:10:36 | 49 秒 | 棋 / 雷 / 刊 |
| 第 2 轮 AI 解密 | 00:10:36 → 00:10:51 | 15 秒 | 1 / 3 / 4，成功 |
| 第 3 轮 AI 拦截 | 00:11:39 → 00:12:27 | 48 秒 | 2 / 3 / 4，失败 |
| 第 4 轮 AI 加密 | 00:13:00 → 00:14:01 | 61 秒 | 冰箱 / 闪电 / 油墨 |
| 第 5 轮 AI 拦截 | 00:15:05 → 00:16:20 | 75 秒 | 1 / 3 / 1，第三步空响应被替换为 1 |
| 第 6 轮 AI 加密 | 00:16:44 → 00:17:35 | 51 秒 | 哆嗦 / 订阅 / 海燕 |

主对局共 18 次模型请求，1 次得到空的最终答案。此比例仅描述本次样本，不代表长期失败率。日志没有记录原始响应的 `finish_reason` 和 usage，因此**不能确定**空答案是否由 2048 token 限制耗尽引起。

## 高优先级问题

### E01 · P1 · 服务端没有完整验证提交者、阶段和输入

**分类：后端正确性 / 游戏公平性。** 位置：[handler.go:203](/Users/zinklu/code/decrypto-the-game/internal/server/handler.go:203)、[handler.go:225](/Users/zinklu/code/decrypto-the-game/internal/server/handler.go:225)。

复现：四人房间开局，B 队玩家在 A 队仍处于加密阶段时发送 `submit_decrypt`，随后 A 队加密者发出线索。B 队未收到错误，提前提交的答案直接成为 A 队的解密结果。另一个房间中，`["", "", ""]` 空线索和 `[9,9,9]` 猜测均被接受，后者计为正常解密失败。

影响：对手或旁观者可代替其他队伍提交，陈旧请求可污染后续阶段；前端禁用按钮不足以保护游戏。建议在服务端统一校验 room/session/round/phase、队伍、角色、三个非空线索、1–4 范围及不重复数字，并以回合标识和一次性提交状态拒绝重放。修复后补消息处理集成测试。

### E02 · P1 · 未选队玩家收到 B 队秘密词

**分类：后端保密边界。** 位置：[bridge.go:324](/Users/zinklu/code/decrypto-the-game/internal/game/bridge.go:324)、[bridge.go:344](/Users/zinklu/code/decrypto-the-game/internal/game/bridge.go:344)。

复现：第五名客户端只 `join_room`，不选择队伍；四位已编组玩家开局。第五名客户端收到 `your_team: "B"`、`your_role: "opponent"` 和 B 队四个秘密词。原因是未在 A 队中找到的人直接被判为 B 队。

影响：未占据任何席位的人可以获知 B 队信息，人数与权限不一致。建议显式区分 A/B/observer，未加入任一队伍时不发送秘密词、不允许参与提交；在开局界面明确未编组玩家的状态。

### E03 · P1 · 重复开始会重新初始化正在进行的游戏

**分类：后端生命周期。** 位置：[handler.go:152](/Users/zinklu/code/decrypto-the-game/internal/server/handler.go:152)、[bridge.go:33](/Users/zinklu/code/decrypto-the-game/internal/game/bridge.go:33)。

复现：同一房主连续两次 `start_game`，第二次仍收到新的 `game_start` 和新秘密词，而不是“已经开始”。开局只检查人数和房主身份，没有检查 `Started`。

影响：重试、双击或异常客户端可能重置游戏，并留下多个推进协程；后者是代码路径风险，本次没有将其压测为崩溃。建议开局状态迁移加锁并保持幂等，保证每房间仅一个有效 session。

### E04 · P1 · 游戏中刷新/断线无法恢复座位

**分类：后端会话 / 前端恢复体验。** 位置：[handler.go:70](/Users/zinklu/code/decrypto-the-game/internal/server/handler.go:70)、[gameStore.ts:184](/Users/zinklu/code/decrypto-the-game/web/src/store/gameStore.ts:184)。

浏览器复现：`8Z6T` 开始后刷新，页面回到首页；填回原昵称和房间码，提示游戏已开始，无法加入。协议测试同样被拒绝。昵称并不构成恢复身份，客户端也未持久化恢复凭证。

影响：一次刷新或短暂网络切换就失去整局参与资格，剩余玩家会等待离线角色。建议为原玩家提供不可猜测的恢复令牌，保留离线席位和宽限期；重连恢复身份、阶段、服务器截止时间和公共历史。界面显示离线者及恢复状态。前端可结合 `/harden`，核心协议需后端改动。

### E05 · P1 · 大厅房主离开后没有人能继续管理房间

**分类：房间生命周期 / 操作阻塞。** 位置：[handler.go:301](/Users/zinklu/code/decrypto-the-game/internal/server/handler.go:301)。

复现：四人大厅中房主断开连接，其席位被移除，但 `owner_id` 仍指向原玩家。剩余玩家补 AI 时收到 `only the room owner can add AI players`，也不能开始游戏。

影响：尚未开局的其他玩家必须另建房间。建议自动移交给在线真人，广播新房主；无真人时回收空房间。若产品选择不移交，也必须明确通知房间失效并提供快速重组入口。

### E06 · P1 · AI 空答案静默变成非法猜测，且模型请求没有期限

**分类：AI 接入 / 容错。** 位置：[player.go:126](/Users/zinklu/code/decrypto-the-game/internal/ai/player.go:126)、[openai.go:97](/Users/zinklu/code/decrypto-the-game/internal/ai/providers/openai.go:97)、[bridge.go:101](/Users/zinklu/code/decrypto-the-game/internal/game/bridge.go:101)。

实测第五轮第三次猜测返回空字符串，日志为 `GuessSingleNumber invalid response "", fallback to 1`。最终记录出现 `[1,3,1]`，违反前端对真人执行的“不重复编号”规则，玩家未收到模型失败提示。

另经代码确认，使用无超时的 `http.DefaultClient`，游戏 context 只有取消没有 deadline；真人的 60/90 秒超时不会包住 AI 分支。本次观察到 75 秒等待，未观察到永久挂起，永久等待属于已确认代码路径的风险。

建议给单次模型调用和整个动作设置期限；记录 `finish_reason` 与 token 用量；对空答案/格式错误进行有限重试，或从剩余合法数字中明确降级；向用户区分“模型失败/重试”与普通猜错。根据实测再决定是否调整 token 预算、模型思考参数或合并三步请求。

## 中优先级问题

### E07 · P2 · 最后一轮没有进入终局档案，结束后同步也无结果

**分类：数据完整性 / 复盘。** 位置：[bridge.go:359](/Users/zinklu/code/decrypto-the-game/internal/game/bridge.go:359)、[bridge.go:557](/Users/zinklu/code/decrypto-the-game/internal/game/bridge.go:557)、[model.ts:169](/Users/zinklu/code/decrypto-the-game/web/src/components/console/model.ts:169)。

浏览器房间第六轮已结束并显示 A 队获胜，但纸带写“05 条记录”，仅含第一至第五轮。`game_over` 只发分数，历史仅在后续回合发送；前端还固定过滤 `row.round < currentRound`。16 轮协议对局结束后 `request_sync` 只返回 room，没有 game。

影响：决定胜负的密码、双方猜测不能复盘；终局也不是可恢复状态。建议终局发送完整最终历史、赢家与结算结果，保留可同步的已结束快照；前端按已结算状态展示最后一轮，不重建任何尚未公开的秘密。可结合 `/harden`。

### E08 · P2 · 换到满员队伍失败时丢失原席位

**分类：房间状态一致性。** 位置：[room.go:73](/Users/zinklu/code/decrypto-the-game/internal/room/room.go:73)。

复现：A 队房主尝试加入已有四人的 B 队，收到满员错误；随后 `request_sync` 显示 A 队变为空。代码在检查目标容量之前就从原队移除玩家，错误分支又不广播新状态。

影响：前端看起来操作失败且位置不变，服务端却已经改变队伍，开始条件与显示可能不一致。建议先验证全部条件，再原子地提交换队结果，失败时不改变任何席位。

### E09 · P2 · 房间码硬件显示无法显示字母

**分类：信息呈现 / 视觉一致性。** 位置：[engine.ts:718](/Users/zinklu/code/decrypto-the-game/web/src/components/console/engine.ts:718)、[manager.go:9](/Users/zinklu/code/decrypto-the-game/internal/room/manager.go:9)。

实测 `R8MP` 的右上角 ROOM CODE 只亮第二位 `8`；`8Z6T` 只显示 `8` 和 `6`。中央屏幕显示完整码。服务端使用字母数字房间码，模型仅有 0–9 阴极。

影响：用户最容易寻找的房间码位置提供不完整信息。建议为字母设计兼容的显示器，或统一为足够容量的数字房间码；不要让两处显示采用不同可表示字符集。可用 `/clarify`、`/polish` 完成界面部分。

### E10 · P2 · AI 仍在思考时显示“已完成 3/3”和 `00:00`

**分类：等待反馈 / 前后端时间一致性。** 位置：[paint.ts:373](/Users/zinklu/code/decrypto-the-game/web/src/components/console/paint.ts:373)、[Console.tsx:157](/Users/zinklu/code/decrypto-the-game/web/src/components/console/Console.tsx:157)、[gameStore.ts:344](/Users/zinklu/code/decrypto-the-game/web/src/store/gameStore.ts:344)。

实测第五轮拦截 75 秒，60 秒后数字钟停在 `00:00`，屏幕仍显示“AI Agent · 已完成 3/3”。`ai_thinking.step` 表示正在执行第几步，却被当作已完成数；倒计时由前端固定创建，未反映 AI 的实际期限。

影响：玩家无法判断是正常等待、模型出错还是游戏卡住。建议显示“正在推理第 3 条，已完成 2/3”；通过服务器统一 deadline，超时进入明确重试/失败状态。若 AI 不设回合倒计时，则显示已等待时长。可用 `/clarify`、`/harden`。

### E11 · P2 · 手机需要反复横移才能核对内容和提交

**分类：响应式 / 操作效率。** 位置：[index.css:32](/Users/zinklu/code/decrypto-the-game/web/src/index.css:32)。

390×844 实测 stage 宽 980px。默认只看到机身左侧，中央内容被裁切，右侧 ACTION 在屏外；横向滑动后可以到达 ACTION，但左侧内容和部分输入键又离开视口。这是当前有提示的横向画布设计，不是按钮完全不可用。

影响：限时游戏中核对词语、线索、数字和提交需要反复移动；手机体验显著弱于桌面。建议保留 3D 机身作为展示，手机提供固定在可视区域的当前任务、三位输入和提交区，并提供方便的关键词/历史面板。可用 `/adapt`、`/arrange`。

## 系统性原因与建议顺序

1. **立即：服务端作为唯一规则入口。** E01–E03 统一验证身份、队伍、阶段和请求归属，禁止旁观者获取秘密，保证开局幂等。
2. **短期：把离线和失败当成正常状态。** E04–E06 加会话恢复、房主移交、AI 期限、合法降级及可见错误。
3. **随后：完整广播和保存状态。** E07–E10 解决终局数据、换队事务、房间码与 AI 提示失配。
4. **体验完善：手机任务操作区。** E11 按操作任务重新组织小屏内容；不必重做桌面机身。

跨层问题不适合只靠界面技能修复。`/harden`、`/clarify`、`/adapt`、`/polish` 可处理对应前端部分，但后端协议与回归测试仍需同时调整。

## 值得保留的实现

- 真人加密者与队友的界面权限、只给加密者显示本轮私密密码，正常路径表现正确。
- 人数不足、非房主管理、无效房间码有明确阻止或错误反馈。
- 数字不能重复、三项完整才可提交，正常前端交互有效。
- 中英文切换保留玩家姓名、输入线索和已选数字；实测选择 `4,3,1` 后切换语言仍能成功提交。
- 历史纸带已有可读的 HTML 内容，Escape 关闭后焦点能回到打开控件。
- 桌面关键控件具有无障碍名称，状态和游戏数据有文本等价内容；本次未作完整 WCAG 合规声明。

## 复现材料与限制

- [协议检查结果](./protocol-results.json)、[边界检查结果](./edge-results.json)、[两次解密失败结束结果](./two-errors-results.json)。JSON 中 `pass: false` 代表当前实现未满足该项期待，不等同于探测程序崩溃。
- [协议探测脚本](./protocol.mjs)、[边界探测脚本](./edge.mjs)、[两次错误结束脚本](./two-errors.mjs)。仅对隔离的本地测试服务运行，会创建测试房间；是本次诊断脚本，不是已集成的长期回归套件。
- [AI 动作与异常摘要](./ai-events.log)。只保留游戏动作及错误行，不含 API Key 或模型思考全文。

复现命令：先从仓库根目录构建并启动 server（`words.txt` 必须在工作目录；模型环境变量由运行者设置），再执行 `node docs/e2e/2026-09-21/protocol.mjs` 等。默认连接 `ws://localhost:8080/ws`，可通过 `E2E_WS_URL` 修改；证据默认写入 `/tmp/decrypto-e2e`，可通过 `E2E_OUTPUT_DIR` 修改。原始测试使用 `GOCACHE=/tmp/decrypto-e2e-go-cache` 避免沙箱缓存权限干扰。

未开展公网部署、浏览器矩阵、长时间压力测试、真实手机硬件性能测试、强制 WebGL 故障测试或完整屏幕阅读器审计。此次结论覆盖实际执行的正常流程、指定模型接入和上述边界场景，不声称所有输入组合都已穷举。
