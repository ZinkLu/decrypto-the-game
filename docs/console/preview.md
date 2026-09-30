# 开发预览

不连服务器也能打开这台机器的任意状态。这里有两样东西，不要混淆：

- **`/preview` 页面**：公开的机身预览页，生产环境也有。
- **预览夹具**：由 URL 参数选择的假对局状态和局部特写，只在开发服务器上有效。

两者都不建立 WebSocket 连接，也不向后端写任何数据。在预览里按 ACTION 只会在本机标记为已提交。

路由的解析在 `web/src/console/view.ts`（`consoleRoute`），各个参数集中在 `options.ts`；试装台的界面在 `Workbench.tsx`。`view`、`detail`、`motion` 和 `paper-frame` 由引擎的部件自己读取（`parts/viewpoint.ts`、`engine.ts`、`parts/printer.ts`）。夹具的内容在 `model.ts` 的 `previewState()`。

## `/preview` 页面

| | `/`（游戏页） | `/preview` |
| --- | --- | --- |
| 连接服务器 | 是 | 否 |
| 对局状态 | 实时 | 固定为加密阶段的夹具 |
| 视角 | 锁定正面，按窗口大小取景 | 可自由旋转和缩放 |
| 翻到背面 | 向内拖把手 | 同左 |
| 窄屏 | 换成紧凑终端 | 保留 3D 机身 |

在 `/preview` 上：

- 拖动空白处或机身旋转，俯仰限制在约 ±72°。按住鼠标中键可以在任何位置拖动，包括控件上。
- 滚轮缩放，范围 0.65–2.4 倍。指针在旋钮上时，滚轮仍然用来转旋钮。
- “重置视角”回到初始角度和缩放。
- 正反两面的控件都参与投影，转到哪一面就能操作哪一面。

Go 服务器对 `/preview` 直接返回 `index.html`，所以这个地址可以直接访问和刷新。

生产构建忽略下文的全部参数：`/` 永远是实时对局，`/preview` 永远是加密阶段的夹具。

## 开发服务器

```bash
cd web && pnpm dev     # http://localhost:3000
```

只看夹具不需要启动 Go 服务器。

参数在 `/` 和 `/preview` 上都有效，区别只在视角：`/` 是游戏里的正面视角，`/preview` 可以旋转。在 `/` 上窗口宽度不超过 850 px 时，夹具显示在紧凑终端里，可以用来检查手机布局；带了 `detail`、`instruments` 或 `words` 时保留 3D 机身。

## 场景：`preview=`

夹具里“你”是 A 队 1 号席，也是房主；房间码 5821；对局中的场景在第 5 回合，倒计时固定显示 45 秒。

| 值 | 状态 |
| --- | --- |
| `home` | 首页，尚未进房 |
| `room` | 房间，两队各四人 |
| `room-empty` | 房间，两队都空 |
| `room-partial` | 房间，A 队一人（名字很长），B 队两人，另有一人未入队 |
| `roster-motion` | 在 `room-partial` 的基础上，底部多出四个按钮：真人入席、AI 入席、末席离开、替换末席，用来看名牌的插拔动作 |
| `encrypting` | 你是加密者，正在写线索 |
| `waiting` | 加密阶段，你是队友，看 Alice 写线索 |
| `listening` | 加密阶段，你是对手，看 John 写线索 |
| `intercept` | 你是对手，正在拦截 |
| `watch-intercept` | 拦截阶段，你是加密者，看对手选号 |
| `decrypt` | 你是队友，正在解码 |
| `watch-decrypt` | 解码阶段，你是加密者，看队友选号 |
| `round_result` | 本轮回执 |
| `game_over` | 行动结束，A 队获胜 |
| `late-game` | 第 16 回合的拦截阶段，已有 15 条完整记录，双方各一次截获、一次失误。用来看最长的纸带 |

没见过的值按 `encrypting` 处理。不带 `preview` 时，`/preview` 以及带了 `instruments` 或 `words` 的页面也默认用 `encrypting`。

## 特写：`detail=`

特写裁剪同一台相机的视锥，相机不移动，所以透视和整机视图完全一致。

| 值 | 对准 |
| --- | --- |
| `screen` | 主显示器 |
| `words` | 四个词窗 |
| `scope` | 示波器及其旋钮 |
| `disk` | 软驱 |
| `meter` | SIGNAL 接收机 |
| `nixie` | 房间码辉光管 |
| `recorder` | 打印机和纸带 |
| `score` | 计分翻牌 |
| `roster` | 名册 |

## 其他参数

| 参数 | 值 | 作用 |
| --- | --- | --- |
| `view` | `oblique`、`opposite` | 只在 `/preview` 上有效。以一侧的斜角开始，两个值方向相反，用来对比两个观察方向下的玻璃折射和反光 |
| `motion` | `slow` | 以五分之一的速度播放显像管和 LED 的开关机、纸带、名牌、队牌、计分翻牌，以及纸带阅读器的进出。软盘、把手和旋钮不受影响 |
| `quality` | `auto`、`high`、`medium`、`low` | 为这次访问固定画质，不读取保存的选择。见[画质与性能](quality.md) |
| `brief` | `hold`、`off` | `hold` 让回合简报一直停在主屏上，`off` 跳过简报 |
| `notebook` | 无需值 | 在开发夹具中打开 HTML 记录板试装：左侧按词号归纳线索，右侧纸条按时序打印回合。需同时使用预览夹具 |
| `paper-frame` | 0 到 1 | 把真实的纸带机构运行到这个进度后定格，用于截图。给了参数但不是数字时取 0.6 |
| `paper-phase` | `feed`、`refill` | 配合 `paper-frame`，定格在送纸或补纸过程中。不给时定格在撕纸过程中 |
| `score` | `flags` | 底部出现计分试装台：循环切换两队的截获和失误（0、1、2），或全部清零。不影响对局 |
| `instruments` | `signal`、`tuning`、`status`、`original` | 打开仪表试装台，在四种仪表之间切换。此时会额外载入 `instrument-studies.glb` 和 `instrument-vu.glb`。没见过的值按 `signal` 处理 |
| `words` | `led`、`crt` | 打开词窗试装台，在 LED 点阵和早期的滤光小显像管之间切换，可以换词组、看细节。和 `instruments` 同时出现时以 `instruments` 为准 |
| `zoom` | 1 到 4 | 词窗试装台的放大倍数。带 `detail=words` 而不给 `zoom` 时为 2 |
| `filter` | `baseline`、`area`、`lod`、`ssaa` | 词窗试装台里 LED 灯珠的缩放算法。默认 `area`，也是游戏里用的那一种 |
| `partial` | `off`、`verify` | 局部帧的开关与校验：`off` 整页只画整帧；`verify` 把每个局部帧和同状态的整帧逐像素比较，不一致在控制台警告并累加到画布的 `data-partial-mismatch`。校验很慢，只用来检查。见[画质与性能](quality.md) |

试装台上的选择会写回地址栏，当前的方案和观察距离可以直接复制给别人。

试装台里的其他仪表和显像管词窗只为对比而保留。出厂的机器只有 SIGNAL 接收机和 LED 词窗。

## HTML 记录板试装：`notebook`

这个试装使用 `FieldNotebook.tsx` 的真实 DOM 和 CSS 表现顶部金属夹装订的单页记录板，不载入新的 3D 模型。只在开发服务器的预览夹具中启用，打开地址后自动展开阅读页。桌面上略微倾斜的记录板与纸条分居左右，宽度上限分别为 470 px 和 440 px，保持竖长比例。纸条按内容自然延伸、贯穿视口，随阅读页整体滚动，不另设固定高度的内部滚动区；桌面高度充足时，记录板在滚动中保持可见。700–850 px 高的桌面视口会适当缩短板面，让底部翻页翘角保持可见；更矮时随阅读页整体滚动。正常游戏的阅读页保持原样。

记录板与纸条同时从屏幕下边缘滑入并渐显，收起时向下离开并渐隐。「记录板」「纸条」两个按钮控制各自显示，默认同时显示。隐藏其中一个后，另一个平滑移到居中位置，显示与隐藏均有短暂的淡入淡出；至少保留一个，隐藏最后一个时会自动显示另一个。

记录板每页只标注所属队伍，纸张右下角微微翘起；点击纸张底边即可在我方与对方之间翻页，键盘也可聚焦底边后按 Enter。每页将公开线索归入 1–4 号，并附上回合编号。我方词号旁显示当前玩家已知的密词明文；对方密词位置是淡色「未知」占位，可直接输入自己的推测，输入不会改动公开记录。切换时纸张从底边先弯起，再绕顶部夹子翻过；分段纸面保持原有长度，文字和笔迹随曲面移动，投影随纸张抬起而收缩，翻起的背页逐渐隐去，约 800 ms 后停稳。连续点击底边会保持当前曲面和动量反转。翻页期间纸面暂停编辑。隐藏或收起时停止翻页；系统开启减少动态效果时所有切换直接完成，`motion=slow` 可放慢动效供检查。

默认直接打字：点击纸面任意空白处，在该位置建立文字框；选中后才出现移动和删除控件，可拖动移动，也可聚焦移动控件用方向键微调。纸面聚焦后按 Enter 也可新增文字。批注不带提示或占位文字。板子上方的实体铅笔、纸套橡皮可点击拿起，用于圈画或擦除；再次点击当前工具即放回并恢复打字，有笔迹时另提供小型撤销控件。快速书写保留浏览器合并的中间采样及抬笔终点，指针意外中断时保留已画部分，可整笔撤销。两队的文字、密词推测和笔迹分别保留，只存在当前页面的内存中，翻页、隐藏后再显示、收起后再展开仍然保留，刷新页面后清空；不会写入房间或影响真实对局。

## 可以直接打开的例子

```
http://localhost:3000/preview?preview=late-game
http://localhost:3000/?preview=late-game&notebook&brief=off
http://localhost:3000/?preview=room-partial
http://localhost:3000/?preview=watch-intercept&brief=off
http://localhost:3000/?preview=encrypting&brief=hold
http://localhost:3000/preview?preview=encrypting&detail=screen&view=oblique
http://localhost:3000/preview?preview=encrypting&detail=disk
http://localhost:3000/preview?preview=roster-motion&motion=slow
http://localhost:3000/preview?preview=late-game&detail=recorder&paper-frame=0.5
http://localhost:3000/preview?preview=late-game&detail=recorder&paper-frame=0.3&paper-phase=feed
http://localhost:3000/preview?score=flags&preview=round_result&detail=score&view=oblique
http://localhost:3000/preview?preview=encrypting&instruments=signal&detail=meter
http://localhost:3000/?words=led&detail=words
http://localhost:3000/?preview=game_over&quality=low
```

## 读出内部状态

开发服务器上，引擎把一些内部状态写在 DOM 的 `data-` 属性里，便于脚本读取：

| 位置 | 属性 |
| --- | --- |
| `.station-stage` | `data-crt-phase`、`data-crt-theme`、`data-crt-level`（主显像管）；`data-paper-phase`、`data-paper-length`、`data-paper-tear`（纸带）；`data-key-disk-phase`（软盘） |
| 渲染画布 | `data-scope-fps`、`data-draw-calls`、`data-triangles`、`data-ambient-pace`、`data-face`、`data-full-frames`、`data-partial-frames`、`data-partial-mismatch`（仅 `?partial=verify`） |

每个可操作的零件都是带 `data-control="<id>"` 的 DOM 元素，脚本可以直接点击或输入。各部件的行为见[显示器件](displays.md)和[机械与交互](mechanics.md)，代码结构见[代码组织](code.md)。
