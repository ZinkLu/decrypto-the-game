# 开发预览

不连服务器也能打开这台机器的任意状态。这里有两样东西，不要混淆：

- **`/preview` 页面**：公开的机身预览页，生产环境也有。
- **预览夹具**：由 URL 参数选择的假对局状态和局部特写，只在开发服务器上有效。

两者都不建立 WebSocket 连接，也不向后端写任何数据。在预览里按 ACTION 只会在本机标记为已提交。

路由和参数的解析在 `web/src/console/view.ts`（`consoleRoute`）、`Console.tsx` 的开头和 `engine.ts`；夹具的内容在 `model.ts` 的 `previewState()`。

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
| `paper-frame` | 0 到 1 | 把真实的纸带机构运行到这个进度后定格，用于截图。给了参数但不是数字时取 0.6 |
| `paper-phase` | `feed`、`refill` | 配合 `paper-frame`，定格在送纸或补纸过程中。不给时定格在撕纸过程中 |
| `score` | `flags` | 底部出现计分试装台：循环切换两队的截获和失误（0、1、2），或全部清零。不影响对局 |
| `instruments` | `signal`、`tuning`、`status`、`original` | 打开仪表试装台，在四种仪表之间切换。此时会额外载入 `instrument-studies.glb` 和 `instrument-vu.glb`。没见过的值按 `signal` 处理 |
| `words` | `led`、`crt` | 打开词窗试装台，在 LED 点阵和早期的滤光小显像管之间切换，可以换词组、看细节。和 `instruments` 同时出现时以 `instruments` 为准 |
| `zoom` | 1 到 4 | 词窗试装台的放大倍数。带 `detail=words` 而不给 `zoom` 时为 2 |
| `filter` | `baseline`、`area`、`lod`、`ssaa` | 词窗试装台里 LED 灯珠的缩放算法。默认 `area`，也是游戏里用的那一种 |

试装台上的选择会写回地址栏，当前的方案和观察距离可以直接复制给别人。

试装台里的其他仪表和显像管词窗只为对比而保留。出厂的机器只有 SIGNAL 接收机和 LED 词窗。

## 可以直接打开的例子

```
http://localhost:3000/preview?preview=late-game
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
| 渲染画布 | `data-scope-fps`、`data-draw-calls`、`data-triangles`、`data-ambient-pace`、`data-face` |

每个可操作的零件都是带 `data-control="<id>"` 的 DOM 元素，脚本可以直接点击或输入。各部件的行为见[显示器件](displays.md)和[机械与交互](mechanics.md)，代码结构见[代码组织](code.md)。
