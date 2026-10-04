# Console 代码组织

前端只有一个界面：一台建模出来的密码通信机。本文说明它的代码放在哪里、数据怎么流动、怎样往里加东西。设计上的取舍见[设计总览](README.md)，构建与运行见[构建与运行](../getting-started.md)。

## 思路

页面分四层，各管一件事：

- **React 管状态和无障碍。** `Console.tsx` 持有全部状态，决定每个控件做什么；设置面板、透明控件、文字记录各是一个组件。
- **Three.js 画机器。** `engine.ts` 载入 Blender 导出的模型，拥有渲染器和帧循环；每个会动的部件在 `parts/` 下有自己的模块。
- **2D canvas 画内容。** 屏幕上的字、名牌、纸带、按键上的印刷都由 `paint()` 画在 canvas 上，再作为贴图贴到机器对应的表面。
- **透明的 DOM 控件盖在 3D 零件上。** 每个可操作的零件都有一个真实的 `<button>`、`<input>` 或 `<a>`，位置由引擎每帧从 3D 投影到屏幕。键盘焦点、读屏软件和中文输入法因此都走浏览器原生路径。

窗口宽度不超过 850 px 时，游戏页隐藏 3D 舞台，改用 `MobileConsole.tsx` 的紧凑界面。两者共用同一份状态、同一套校验和同一个 `act()`。WebGL 无法启动或模型载入失败时，DOM 控件和文字记录直接显示出来，游戏仍可进行。

## 目录

```
web/
  index.html
  vite.config.ts          开发服务器在 3000 端口，把 /ws 代理到 8080
  postcss.config.js       只运行 autoprefixer
  package.json            pnpm 是唯一的包管理器
  src/
    main.tsx              挂载 React
    App.tsx               懒加载 Console，加载期间显示启动画面
    index.css             全局样式；console/ 的组件另有自己的 CSS，随组件一起列出
    console/              这台机器（见下表）
      parts/              引擎的部件，每个会动的组件一个模块
    store/gameStore.ts    对局状态与发往服务器的动作（Zustand）
    services/websocket.ts WebSocket 连接与自动重连
    services/voice.ts     语音：麦克风、接入与重连、播放与静音、按住说话（见后端架构的"语音"）
    services/cloudflareVoice.ts  Cloudflare Realtime SFU 的页面一侧
  scripts/*.test.mjs      测试
  scripts/perf/           渲染功耗的测量脚本，在无头 Chrome 里驱动开发服务器上的引擎（见画质与性能）
  public/
    models/               decrypto-console.glb、console-surfaces.json，及开发对比用的两个仪表模型
    audio/                音效库 console-foley-v3.wav、music/ 下四段音乐、CREDITS.md
    fonts/                软盘标签的手写字体
    images/guide/         玩法说明的插图
```

## `web/src/console/` 的文件

### 组装

| 文件 | 职责 |
| --- | --- |
| `Console.tsx` | 整个界面的根组件。持有 `LocalState`，从 store 取对局状态，调用 `paint()`，驱动引擎、声音和音乐，把输入分发给 `act()` / `change()` |
| `Controls.tsx` | 盖在 3D 零件上的透明 DOM 控件，以及旋钮、纸带、把手的指针手势（`useHandleGrip`） |
| `Settings.tsx` | 页面右上角的导航和设置：画质、主题、声音、语音、语言 |
| `VoiceBar.tsx` | 导航与设置之间的语音控件（开麦、悄悄话、状态、在线的人），以及设置里的说话方式与语音音量 |
| `voice.ts` | 语音的规则：什么时候分组讨论、声音送到哪个频道、听得到哪个频道。只有纯函数，可在 Node 里测试 |
| `Transcript.tsx` | 机器上全部内容的文字记录，给读屏软件用；3D 无法启动时直接显示 |
| `MobileConsole.tsx` | 窄屏的紧凑终端。只接收状态和回调，不持有自己的草稿 |
| `ArchiveSheet.tsx` | 纸带拉出后的阅读器（`<dialog>`）：并列放置记录板与逐回合打印的纸条，处理打开和收起 |
| `FieldNotebook.tsx` | 按词号归纳双方公开线索的记录板；翻页、密词推测、文字和手写笔迹，编辑内容保存在页面内存中 |
| `ArchiveViews.tsx` | 「记录板」「纸条」显示切换，至少保留一件可见，并驱动居中与淡入淡出 |
| `archive-view-motion.ts` | 上面这个切换的过渡动画（FLIP），尊重减弱动效偏好 |
| `NotebookTools.tsx` | 记录板的工具条：拿起／放回铅笔和橡皮、撤销 |
| `NotebookWriting.tsx` | 记录板上的手写便条：放置、拖动、随纸张缩放 |
| `EncryptorIntro.tsx` | 密钥软盘发放时的加密者播报，桌面端落在软盘槽上，窄屏回到自己的驱动器 |
| `ShortcutHelp.tsx` | 页面导航里的快捷键说明面板（`?` 打开），由 `Settings.tsx` 挂出 |
| `OperationTour.tsx` / `TourSpotlight.tsx` | 首次操作提示：按当前可用功能逐步说明入房、房间号、历史、密词与语音，高亮对应控件；可以跳过或从页面导航重看 |
| `GuideContent.tsx` | 玩法说明和原版桌游介绍的 DOM 版本，供窄屏和读屏软件使用 |
| `hooks.ts` | 从 `Console.tsx` 分出来的几组 effect：扬声器和音乐的生命周期、软盘状态机的定时器、减弱动效、字体和插图的载入 |
| `useDiskPull.ts` | 拖拽软盘的指针手势，桌面和窄屏共用 |
| `options.ts` | 地址栏对这次访问的要求：路由、预览夹具和各个开发参数；`portable()` 判断是否窄屏 |
| `Workbench.tsx` | 开发试装台：翻旗、名牌、仪表、词窗的试装界面和它们改动过的夹具状态。生产构建里到不了 |

这些组件各有一份自己的 CSS（`notebook.css`、`page-turn.css`、`shortcuts.css` 等），由组件自行引入；`index.css` 只放全局样式。

### 状态与规则

这些模块不引入 Three.js，也不直接操作 DOM，可以在 Node 里测试。

| 文件 | 职责 |
| --- | --- |
| `actions.ts` | `reachable()`：一个控件在机器当前状态下是否起作用（有没有电、哪一面朝前、连没连上、有没有请求在途） |
| `model.ts` | `LocalState` 及其初始值；硬件状态推导（`consoleHardware`、`terminalView`）；行动资格（`seatAction`、`roleState`）；软盘状态机；回合角色（`roundCast`，以及按行动取进度的 `transmission`）；名册、纸带记录、主题色；浏览器存储的读写；预览夹具 `previewState` |
| `view.ts` | 路由（`consoleRoute`）、正面取景（`gameFraming`）、把手拖拽与滚轮缩放的换算、把手的投影表面 |
| `i18n.ts` | 中英文对照表、`translate`、语言偏好、服务器错误文案的本地化 |
| `guide.ts` | 玩法说明的文字、示例词和原版桌游链接 |
| `quality.ts` | 画质档位、每档的开关、自动档的降档规则、闲置时的帧率。见[画质与性能](quality.md) |
| `partialFrame.ts` | 氛围帧画整帧还是局部帧的判定，以及动态区域矩形的外扩、裁剪与合并。见[画质与性能](quality.md) |
| `mechanics.ts` | 纸带和软盘的尺寸、时长和姿态函数 |
| `shortcuts.ts` | 键盘意图的识别：哪些按键在什么焦点下算机器操作，哪些留给浏览器和输入法 |
| `onboarding.ts` | 操作提示的步骤、桌面与窄屏说明、目标选择器，以及已看步骤和跳过偏好的浏览器存储 |
| `scoreFeedback.ts` | 计分事件的判定（`scoreTone`）和背景脉冲的时序（`ScorePulse`），供引擎与主屏共用 |
| `notebook-writing.ts` | 手写便条的落点、拖动和越界收回的几何规则 |
| `notebook-ink.ts` | 手写笔迹的采样：合并浏览器的事件、保留短尾和点 |
| `notebook.ts` | 玩家笔记的存储键和解析。目前只有测试引用，界面没有使用 |

### 绘制

| 文件 | 职责 |
| --- | --- |
| `paint.ts` | `paint()`：准备好画笔（`Painter`），按顺序调用下面几个模块，最后汇总成 `Content`。`Content`、`Frame`、`Target` 的类型也在这里 |
| `paintScreen.ts` | 主屏的每一页：首页、房间、简报、填写、旁观、回执、结局，以及脱机提示和电量条 |
| `paintFaces.ts` | 主屏以外的表面：词窗、名册、计分板、纸带、键盘、相位面板、ACTION、软盘标签、背面控件；`paintClock()` 单独画倒计时，`knobLabel()` 生成旋钮的读数文字 |
| `paintGuide.ts` | 玩法说明的四页和翻页导航 |
| `paintKit.ts` | 绘图工具：配色、排字、换行、七段数码、磨损；`Painter` 的类型 |
| `dotMatrix.ts` | 词窗 LED 点阵的字体、排版规则和驱动器（自检、逐列载入、断电） |
| `dotFiltering.ts` | LED 灯珠缩放时的采样方式及其着色器片段 |
| `finishes.ts` | 运行时生成的队牌珐琅和计分板拉丝镍贴图 |

### 渲染

| 文件 | 职责 |
| --- | --- |
| `engine.ts` | `ConsoleEngine`：渲染器、模型载入、把状态分发给各部件、帧循环和它的节奏、画质、把目标投影成屏幕坐标（`bounds()`） |
| `parts/` | 引擎的部件，见下一节 |
| `crt.ts` | 显像管面板的几何：曲面网格、透过玻璃的折射映射及其逆映射 |
| `crtShader.ts` | 显像管和 LED 点阵的片段着色器，包括主屏的闪烁单元和逐行写屏 |
| `crtMotion.ts` | 显像管开关机的电路模拟（`CrtTube`）和换画面的时序（`CrtMotion`） |
| `scope.ts` | 示波器：两个振荡器、一束电子、会衰减的荧光粉 |
| `instruments.ts` | SIGNAL 接收机的指针和旋钮，以及开发对比用的另外几种仪表 |
| `partialRedraw.ts` | `PartialRedraw`：氛围帧的局部重画。持有上一整帧的副本和动态区域的矩形，画局部帧，并在开发时逐像素校验。判定和矩形运算在 `partialFrame.ts` |

### 机械

| 文件 | 职责 |
| --- | --- |
| `rosterMotion.ts` | 名牌和队牌的插入、抽出时序 |
| `scoreFlagMotion.ts` | 计分翻牌的释放、翻转和回弹 |
| `tearing.ts` | 纸带的送纸、撕纸物理模拟和补纸（`ReceiptTransport`、`TornSheet`） |
| `page-turn.ts` | 记录板翻页的纸页弹簧和弯曲（`stepNotebookHinge`、`notebookPaperBend`），以及把它们接到 DOM 上的 `attachNotebookTurn` |

### 声音

| 文件 | 职责 |
| --- | --- |
| `sound.ts` | `ConsoleAudio`：音效的播放、静音和节流；`gameSound()` 决定对局状态变化对应哪个音效 |
| `soundBank.ts` | 音效在 WAV 文件中的位置。由 `assets/audio/build_bank.py` 生成，不要手改 |
| `crtSound.ts` | 把显像管的开关机过程翻译成声音事件 |
| `music.ts` | `ConsoleMusic`：背景音乐的切换、淡入淡出和偏好 |

`scoreRegister.json` 是计分板的尺寸和材质，建模脚本和引擎共用。

### 引擎的部件：`parts/`

每个模块是一个类，持有自己的零件和状态。引擎在构造时创建它们，模型载入后调用 `install()`，状态变化时调用 `update()`，每帧调用 `tick()`。

| 文件 | 职责 |
| --- | --- |
| `chassis.ts` | `Chassis`：载入后的机身。按名字查零件，为每个表面建平面，上传贴图（主屏按 canvas 身份更新，其他表面用近似哈希去重），登记会动的组件并合批其余网格。`Effect` 和 `settle()` 也在这里 |
| `viewpoint.ts` | `Viewpoint`：相机、取景和特写、沿把手翻面、预览页的旋转与缩放 |
| `studio.ts` | `Studio`：环境光、主光、面光源、背景墙 |
| `glass.ts` | 显像管玻璃、辉光管亚克力罩和接收机表蒙的材质 |
| `displays.ts` | `Displays`：六只显像管和四个 LED 词窗的开关机、换画面、主屏的闪烁与逐行写屏 |
| `oscilloscope.ts` | `Oscilloscope`：示波器的四个旋钮和屏幕 |
| `nixies.ts` | `NixieBay`：房间码辉光管的数字、光晕和呼吸 |
| `lamps.ts` | `Lamps`：各指示灯、灯光自检、LOCK 灯 |
| `intercom.ts` | `Intercom`：对讲旋钮的挡位、TALK 键的行程、RX 灯和路由灯 |
| `keys.ts` | `Keys`：电源开关、说明键、数字键、ACTION 和复制键的行程 |
| `printer.ts` | `Printer`：纸带的网格、送纸、撕纸和补纸 |
| `diskDrive.ts` | `DiskDrive`：软盘和弹出键的姿态 |
| `roster.ts` | `RosterRack`：八张名牌、两块队牌和它们的珐琅 |
| `scoreRegister.ts` | `ScoreRegister`：八片计分翻牌 |
| `rearPanel.ts` | `RearPanel`：电池仓盖、电池、插头与线缆、两个滑动开关 |

`tick()` 返回这一帧做了什么，用 `Effect` 的几个标志按位或起来：

| 标志 | 含义 |
| --- | --- |
| `ambient` | 只有自己在动的东西变了（指针、电子束），按画质档位的节奏画；氛围帧里它只在登记过的区域内重画 |
| `redraw` | 玩家改变了什么，立即画 |
| `shadow` | 立即画，并重新投射阴影 |
| `project` | 立即画，并让 DOM 控件跟上零件的新位置 |

引擎把各部件的标志合并，每帧最多重投影一次、更新一次阴影。没有部件报告变化时，帧循环就睡到下一个氛围帧。

只到节奏才画的氛围帧不重画整幅画面：引擎把上一整帧的拷贝铺回去，只在会动的区域里重新渲染（见[画质与性能](quality.md)的“氛围帧只重画在动的区域”）。会自己动的部件通过 `ambientRegions(): THREE.Object3D[]` 登记这些物体，引擎把它们汇总交给 `PartialRedraw`，后者在拷贝整帧时把包围盒投影成画布矩形。登记清单：显像管平面（`Displays`，LED 词窗只在跑马灯爬行时登记）、辉光管的光晕和余辉（`NixieBay`）、LOCK 灯的网格（`Lamps`）、接收机的整块表盘玻璃（`ConsoleInstruments`）、对讲的 RX 灯和两颗路由灯（`Intercom`）。两种帧的判定和矩形的外扩、裁剪、合并在 `partialFrame.ts` 里，是不依赖 three.js 的纯函数，测试在 `scripts/partial-frame.test.mjs`。

一个相关约定：往目标位置阻尼靠近的动作必须能精确落停（`settle()`，或到阈值直接取目标值）。报了 `Effect` 的门限之下如果还在缓慢漂移，漂移的像素没有任何帧会重画，局部帧的拷贝就会在那里失准。

各部件的行为分别写在[显示器件](displays.md)、[机械与交互](mechanics.md)、[背面联动](rear-linkage.md)、[声音](audio.md)和[主题色](themes.md)里。

## 数据流

```
服务器消息
  → services/websocket.ts
  → store/gameStore.ts            对局状态（StationState）
  → Console.tsx                   加上 LocalState，推导硬件状态和显示状态
  → paint()                       Content：每个表面的 canvas + 可操作的目标
  → ConsoleEngine.update()        上传贴图、驱动零件、投影目标
  → 用户操作 DOM 控件
  → act(id) / change(target, value)
  → gameStore 的动作              createRoom、submitClues …
  → WebSocket
```

### 两份状态

**对局状态**在 `gameStore.ts`，类型在 `model.ts` 里叫 `StationState`。它只由服务器消息改变：房间、队伍、回合、角色、线索、历史、比分、截止时间。消息格式见 [WebSocket 协议](../protocol.md)。

**本机状态**是 `model.ts` 的 `LocalState`，由 `Console.tsx` 用 `useState` 持有。它描述这一台终端：

- 还没发出的输入：代号、房间码、三条线索、三位猜测、当前选中的位置
- 屏幕上翻到哪一页：玩法说明、原版介绍、简报
- 机器的物理状态：电源开关、拔掉了哪些线、取出了哪些电池、电池仓盖、正面还是背面、软盘在哪里、纸带是否拉出
- 旋钮的位置：示波器的四个旋钮、接收机的调谐和增益
- 偏好：语言、主题、音效、音乐
- 对讲面板（`intercom`）：服务器是否开启语音、线路、旋钮挡位、声音送往哪一路、TALK 键是否按下。它从语音的状态推出，因此对讲变化会重画受影响的目标；谁在说话变得太快，不放在这里，由 RX 灯直接读取

本机状态不会整体发给服务器。发出去的只有动作本身（线索、猜测）和进度（`sendProgress`：正在填第几格、哪几行已经有字）。草稿文本只交给服务器保管，用于超时代发，不转发给其他玩家。

### 从状态到画面

`Console.tsx` 每次渲染依次做这几步：

1. `consoleHardware(u, s)` 从电源开关、线缆、电池和连接状态算出 `powered`、`online`、`supply` 等。`powerOn` 只表示开关的位置，有没有电要看 `powered`。
2. `terminalView(s, held, u)` 决定终端显示哪份对局状态。在线时就是实时状态。脱机时（拔了网线、断电、正在重连）停在脱机前的画面，同时立即收回已经过期的私密信息：秘密词和本轮密码只有在座位和密钥都没变时才保留。
3. `paint(displayState, u, …)` 返回 `Content`：
   - `frames`：表面名到 canvas 的映射，如 `screen`、`word0`–`word3`、`rosterA0`、`paper`、`key0`
   - `targets`：可操作的目标，每个带有 `id`、所在表面、在该表面 canvas 上的矩形和无障碍标签
   - 其余字段告诉引擎发生了什么：`scoreFlags`、`seats`、`roomCode`、`paperRecords`、各种 key（`displayKey`、`screenPage`、`wordPrivacyKey` …）
4. `roleState(s, u)` 在 `paint()` 和 `act()` 里判断这个座位现在能不能行动、输入是否完整。
5. `engine.update(content, u)` 上传新的主屏 canvas；其他表面比较 32×32 缩略图的近似哈希，相同就跳过上传。同一张主屏 canvas 不重复上传，也不参与缩略图哈希，避免单个数字或横杠的变化被漏掉。随后把硬件状态交给各个动画，最后调用 `project()`。
6. `project()` 对每个目标调用 `engine.bounds(target)`，得到它在屏幕上的矩形，写进对应 DOM 控件的样式。背对相机或侧得太厉害的表面返回 `null`，控件随之隐藏。显像管上的输入框要先按当前相机把折射和桶形畸变反算回去，这样光标才落在画出来的字上。

### 为什么转旋钮不重画

`paint()` 要画六十来张 canvas，其中纸带很长。旋钮每转一点都重画一遍是浪费，所以 `Console.tsx` 用 `paintKey` 做记忆化：

- `paintKey` 是 `LocalState` 的 JSON，但把旋钮位置（`scopeFreq`、`scopeWave`、`scopeRate`、`scopeAxis`、`meterAmplitude`、`meterRate`）和软盘的拖拽量都置零，把秒数换成 `paintedSeconds(seconds)`。
- `paintedSeconds` 在剩余 16 秒及以上时返回同一个值，所以平时倒计时不触发重画；最后 15 秒每秒重画一次，屏幕上要显示警告。这个固定值不是 0，因为 0 表示时间到：回合重新获得时间（比如服务器重启后）时 `paintKey` 会变，屏幕会重画。
- 倒计时钟由 `paintClock()` 单独画，每秒只更新一张 520×218 的贴图。
- 旋钮的读数标签另外计算（`knobLabel`），旋钮的角度由引擎直接从 `LocalState` 读取。

结果是：模拟量输入只改变引擎里的目标角度和控件的 `aria-valuetext`，不触发 `paint()`。

加新状态时要注意这一点：一个状态变化如果既不改变 `displayState` 也不改变 `paintKey`，屏幕就会停在旧画面上。

### 从输入回到服务器

所有按钮都走 `act(id)`，文本输入走 `change(target, value)`。

`act()` 先问 `actions.ts` 的 `reachable(id, 机器状态)`，这个控件现在起不起作用。规则按顺序是：

1. 翻面、电源开关、音效和音乐开关：任何时候都可用（电源开关在正面，背对时够不着）
2. 机器没电且在正面时，只有软盘还能取放
3. 背面的电池仓、电池、插头和灯光自检：电池要先打开仓盖，插头要从背面拔，自检要有电
4. 机器背对时，正面的控件都不起作用
5. 本机的屏幕操作不需要网络：跳过简报、翻页、遮词、纸带、软盘、旋钮、数字键、对讲；简报期间的 ACTION 也算。松开按住的 TALK 键任何时候都有效
6. 离开频道和复制房间码需要网络，但不等在途的请求
7. 其余都是发往服务器的操作，需要网络，并且一次只发一个请求

通过之后，`act()` 才执行这个控件的动作，其中还有座位自己的规则（比如只有当前行动的人能选号）：

- `transmit`（红色 ACTION 键）：按当前阶段调用 `createRoom` / `joinRoom` / `startGame` / `submitClues` / `submitIntercept` / `submitDecrypt` / `returnToRoom`
- 选队、加减 AI

键盘意图由 `shortcuts.ts` 统一识别（数字键 1–4、Backspace、Enter、Ctrl/Cmd+Enter、H、G、?、Esc、方向键），`Console.tsx` 的全局 `keydown` 监听再按面板、供电和朝向决定是否交给同样的 `act()` 调用。`ShortcutHelp.tsx` 在页面导航提供常驻说明；`Controls.tsx` 复用快捷键标记生成无障碍属性和悬停提示。语音服务独立处理反引号的按下与松开，以及 V 切换全桌／队内；快捷键和网页的「悄悄话」按钮共用 `toggleVoiceChannel()`，只在语音接通、有队伍且未分组讨论时切换。语音复用相同的文字编辑检测，记录面板也能通话。

## 模型与表面

引擎在 `ConsoleEngine.load()` 里同时载入两个文件：

- `/models/decrypto-console.glb`：机器的几何和材质
- `/models/console-surfaces.json`：表面清单，给出每个可贴图表面在机器坐标里的位置、尺寸和朝向

`Chassis` 为清单里的每个表面建一个平面（显像管是曲面），`paint()` 里同名的 frame 就贴在上面。把手、电池仓和灯光自检三个表面的坐标写在代码里（`view.ts` 的 `handleSurfaces` 和 `load()` 内），不在清单中。

**两个文件共用一个版本号。** `load()` 里的 `revision` 会拼进两个 URL。导出新模型后必须改这个值，否则浏览器可能拿缓存里的旧几何配新标签。

### 引擎按名字查找的零件

下列名字由 Blender 场景决定，各部件在 `install()` 里按名字取用。缺少标了“必需”的零件时载入失败，界面退回文字控件。

| 零件 | 用途 |
| --- | --- |
| `FloppyTransport`（必需）、`FloppyEject`、`Floppy disk` | 软盘的行程、弹出键；`travel_axis` 属性给出行程方向 |
| `ScopeTuning`、`ScopeWave`、`ScopeRate`、`ScopePersistence`（必需） | 示波器的四个旋钮 |
| `PowerSwitch`（必需） | 电源开关；`throw_degrees` 属性给出摆角 |
| `BatteryDoor`（必需）、`BatteryCell_0`–`3` | 电池仓盖和四节电池 |
| `CablePlug_RJ45` / `Serial` / `DC`，`Tactile_… flexible lead` | 三个插头和各自的线缆；线缆靠 `unplugged` 形变目标弯曲 |
| `Instrument_signal`（必需）、`ReceiverNeedle`、`SignalGlass`、`MeterAmplitude`、`MeterRate` | SIGNAL 接收机 |
| `ScoreFlag_{A,B}_{intercept,failure}_{0,1}`（必需） | 八面计分翻牌 |
| `RosterCard_A0`–`B3`，`Front_roster team plaque A` / `B` | 八张名牌和两块队牌；`travel` 属性给出名牌行程 |
| `Nixie_Digit_{位}_{数字}`、`NixieCover_…` | 房间码辉光管的四十个数字和亚克力罩 |
| `Key_0`–`4`、`TransmitLever`、`ManualKey`、`ChannelCopy` | 数字键、ACTION 键、说明键、复制键 |
| `PaperFeed`、`Paper back`、`Paper roller`、`Printer opening` | 纸带机构 |
| `RearSoundSwitch`、`RearMusicSwitch`、`RearTestLamp`（必需）、`Connection lens`、`Instrument_RJ45 lamp 0` / `1` | 背面的声音开关和各指示灯；开关的 `centerX` 属性给出滑动中心 |
| `IntercomSelector`、`IntercomTalk`（内含 `IntercomTX`）、`IntercomRX`、`IntercomAll`、`IntercomTeam` | 对讲旋钮、TALK 键和四盏灯；`detent_degrees` 给出挡位间隔，`travel` 给出按键行程 |

建模脚本和导出方法见[建模流水线](../../assets/console/README.md)。

### 运行时合批

`.blend` 和 GLB 里每个零件都保持独立，便于编辑。载入后 `Chassis.batch()` 把静止、不透明的网格按材质合并，减少绘制调用。这些东西不参与合并：

- 部件登记过的组件。部件用 `chassis.moving(名字)` 取零件，取到的同时就登记为“会动”，它和它里面的网格不会并进机身；带 `merge` 的组件在自己内部合批，轴心不变
- 带形变目标的网格，即三根线缆
- 透明材质

只用来读取位置、自己不动的零件用 `chassis.part(名字)` 取，不登记。

合批保留 `position`、`normal`、`uv`、`color` 四个属性，因为材质贴图和烘焙的接触阴影要用。

## 多语言

`translate(locale, message, values)` 以中文原文为键。中文直接返回原文，英文在 `i18n.ts` 的 `messages` 表里查，查不到就回退到中文。`{0}`、`{1}` 是占位符。

代码里写中文原文，在显示的地方翻译：

```ts
t('第 {0} 回合', [s.round])
```

需要先生成、后显示的文案用 `Line` 类型（`[键, 参数]`）传递，见 `seatDuty`、`deadlineWarning`。

不翻译的内容：

- 机身上固定的英文印刷：NETWORK、ACTION、ROOM CODE、计分板的刻字等
- 玩家的名字和已经提交的线索


服务器返回的错误是英文短句。常见的几条在 `gameStore.ts` 的 `translateError()` 里换成中文原文，再按普通文案翻译；其余由 `i18n.ts` 的 `localizeError()` 按原文或模式对应到两种语言。

词库的条目写成 `词[word]`。`model.ts` 的 `word(s, locale)` 在中文界面取方括号前的部分，在英文界面取方括号里的部分；没有方括号时两种语言都显示原文。

语言偏好存在 `decrypto-locale`。没有保存过时，浏览器语言不是中文就用英文。

## 浏览器里保存了什么

键名沿用历史上的 `decrypto` 前缀。所有读写都包在 `try` 里，存储被禁用时只在本次会话内有效。

| 键 | 位置 | 内容 | 读写处 |
| --- | --- | --- | --- |
| `decrypto-device-v1` | localStorage | 64 位十六进制的设备令牌，进房时发给服务器 | `gameStore.ts` |
| `decrypto-session-v1` | sessionStorage | 房间码和座位的恢复令牌，用于刷新或断线后回到原座位 | `gameStore.ts` |
| `decrypto-draft` | sessionStorage | 当前座位、回合和阶段下写了一半的线索或猜测 | `model.ts` |
| `decrypto-name` | localStorage | 上次用的代号 | `model.ts` |
| `decrypto-locale` | localStorage | `zh` 或 `en` | `i18n.ts` |
| `decrypto-theme` | localStorage | 主题 ID；旧值 `rose` 读作 `radio` | `model.ts` |
| `decrypto-quality` | localStorage | 画质选择：`auto`、`high`、`medium`、`low` | `quality.ts` |
| `decrypto-quality-auto` | localStorage | 自动档上次测定的档位 | `quality.ts` |
| `decrypto-music` | localStorage | 音乐开关和音量 | `music.ts` |
| `decrypto-voice` | localStorage | 说话方式（`toggle` 或 `hold`）和语音音量 | `services/voice.ts` |

音效开关、拔掉的线缆、取出的电池和旋钮位置不保存，刷新后回到默认值。线缆和电池在换房间时也会复位。

## 测试

```bash
cd web && pnpm test
```

它运行 `node --test scripts/*.test.mjs`，不需要浏览器和 GPU。

测试直接读 TypeScript 源文件：用 `typescript` 的 `transpileModule` 转成 JavaScript，再以 `data:` URL 的形式 `import`。模块之间的相对引用在转译后替换成对应的 `data:` URL。`scripts/load.mjs` 的 `moduleUrl(名字)` 会顺着引用把同目录的模块一并载入；较早的测试各自写了替换。需要 Three.js 的模块（`instruments.ts`、`crtShader.ts`）把 `'three'` 替换成 `import.meta.resolve('three')` 的结果。`paint()` 的测试给 `document.createElement` 一个假的 canvas，记录画了哪些字。

由此得出一条规则：**要测试的逻辑放在不依赖 WebGL 和真实 DOM 的模块里。** `engine.ts`、`parts/` 和各个 `.tsx` 组件没有测试，所以时序、状态机、几何、物理和操作规则都写在独立模块中，引擎和组件只负责调用。

一部分测试还读 `public/models/` 下的 GLB 和表面清单，检查导出的模型是否符合运行时的假设。

| 文件 | 覆盖 |
| --- | --- |
| `console.test.mjs` | 行动资格、纸带记录的可见范围、名册状态、阶段灯、主题色及其对比度、对局音效的选择 |
| `transmission.test.mjs` | 回合角色、简报、旁观席看到的进度（两队各自的数字给谁看）、各席位在猜测阶段的提示、倒计时警告与超时说明 |
| `store.test.mjs` | store 对协议消息的处理（包括两队同时猜时一队先交）、设备令牌、断线与恢复 |
| `hardware.test.mjs` | 正反面目标互不重叠、断电和拔网线后哪些控件还在、接收机信号、背面的声音开关 |
| `actions.test.mjs` | 哪些控件不需要电、哪些不需要网络、背对时哪些够不着；所有控件在所有机器状态下的穷举 |
| `parts.test.mjs` | 引擎按名字取用的零件都在导出的模型里；会动的组件互不嵌套 |
| `rear-linkage.test.mjs` | 供电组合、脱机时的显示与私密信息收回、读盘暂停、AUX |
| `key-disk.test.mjs` | 密钥软盘的发放、读取、弹出和作废 |
| `disk-motion.test.mjs` | 软盘插入和弹出的行程，导出模型的轴向 |
| `i18n.test.mjs` | 两种语言覆盖所有阶段的屏幕和标签、语言偏好、词窗排版、私密密码何时上屏、玩法说明与简报 |
| `view.test.mjs` | 路由、把手手势、取景、滚轮缩放 |
| `quality.test.mjs` | 档位只减不增、设置提示、闲置帧率、自动降档、偏好存储 |
| `crt-motion.test.mjs` | 显像管的开机、关机、热启动和换主题 |
| `crt-optics.test.mjs` | 面板曲率、折射视差、输入区域与画面对齐 |
| `crt-shader.test.mjs` | 着色器缓存后仍绑定实时的配色和驱动参数 |
| `crt-sound.test.mjs` | 显像管各阶段的声音事件 |
| `dot-matrix.test.mjs` | 点阵字体、排版、驱动器的启动与换词 |
| `dot-filtering.test.mjs` | 灯珠缩放时亮度守恒 |
| `scope.test.mjs` | 示波器旋钮的标定、波形、锁定与滑动、荧光粉 |
| `instruments.test.mjs` | 接收机只动指针；出厂模型不含对比用的仪表 |
| `roster-motion.test.mjs` | 名牌的插入、替换和抽出 |
| `score-flags.test.mjs` | 计分翻牌的翻转、断电保持，导出模型的翻牌零件 |
| `notebook.test.mjs` | 笔记解析；纸带的送纸、撕纸和补纸；导出模型里的纸带、背面、名牌和辉光管结构 |
| `page-turn.test.mjs` | 记录板翻页的落定、纸页不拉伸、反转时保留动量、与帧率无关 |
| `notebook-ink.test.mjs` | 手写笔迹的采样：短笔画、合并事件的快笔、撤销的分界 |
| `notebook-writing.test.mjs` | 便条始终留在纸面上：落点、拖动、文字变长和纸张缩放 |
| `voice.test.mjs` | 分组讨论的规则、声音送到哪个频道、全桌和加密者何时静音、对讲控件的挡位和两种语言的说明 |
| `voice-keyboard.test.mjs` | 反引号和 V 的快捷键在焦点或状态变化后安全地切换频道、松开按住的麦克风 |
| `shortcuts.test.mjs` | 键盘意图的识别：数字键、Enter、输入法合成、浏览器组合键不成为机器操作、提示与无障碍属性一致 |
| `onboarding.test.mjs` | 操作提示只包含当前可用的对局功能；已看步骤和跳过偏好的存储、损坏数据与浏览器存储不可用时的降级 |
| `teammate-choices.test.mjs` | 队友同时猜测时各自的部分选择和 AI 建议，按行动、队伍、回合和稳定 ID 归属 |
| `result-flow.test.mjs` | 一个回合的结果对两队各意味着什么，回执的文案和两种语言的覆盖 |
| `score-feedback.test.mjs` | 计分脉冲只对新事件触发，队伍的视角，断电、减弱动效和脱机时安静地消费事件 |
| `partial-frame.test.mjs` | 氛围帧的判定，动态区域矩形的外扩、裁剪与合并 |
| `sound.test.mjs` | 音效的解锁、静音、节流和页面隐藏 |
| `music.test.mjs` | 音乐的场景切换、结局、淡入淡出和偏好 |

## 怎样加东西

### 加一个控件

1. 确定它在哪个表面上。现有表面放得下，就在该表面的 canvas 坐标里选一个矩形；否则要在模型里加零件，并在 `console-surfaces.json` 里加表面（见[建模流水线](../../assets/console/README.md)），然后更新 `revision`。
2. 主屏上的控件在 `paintScreen.ts` 里画，其他表面在 `paintFaces.ts` 里画，并调用 `target(surface, id, label, x, y, w, h)`。主屏上的按钮用 `button()`，它同时完成这两件事。`label` 是无障碍标签，要经过 `t()`。
3. 在 `Console.tsx` 的 `act()` 里处理这个 `id`。它受哪些条件限制由 `actions.ts` 的 `reachable()` 决定：没有登记的 `id` 按发往服务器的操作对待，需要电、网络和空闲的线路。不需要网络的本机操作要加进 `local` 名单。
4. 背面的控件要把 `id` 加进 `paintFaces.ts` 里 `paintRear()` 的 `rearControls`，否则翻到背面时会被过滤掉。
5. 零件要动的话，在 `parts/` 里找到它所属的部件（或新建一个），在 `install()` 里用 `chassis.moving(名字)` 取零件，在 `tick()` 里移动它并返回对应的 `Effect`。新部件要在 `engine.ts` 的构造函数、`load()`、`update()` 和 `tick()` 里各接一行。会自己动（报 `Effect.ambient`、或在不报 `Effect` 的帧里改变像素）的零件还要在所属部件的 `ambientRegions()` 里登记，否则它在局部帧里会冻住；`?partial=verify` 可以验证登记是否完整。
6. 窄屏界面不会自动出现这个控件，需要时在 `MobileConsole.tsx` 里加对应的按钮，调用同一个 `onAct(id)`。
7. 补测试。`hardware.test.mjs` 会检查正反面的目标互不重叠，`actions.test.mjs` 检查操作规则。

### 加一种屏幕状态

1. 状态来自服务器：在 `gameStore.ts` 加字段，在 `handleServerMessage` 里赋值，并按需加进 `gameFields`，让回到大厅时清空。
2. 状态属于本机：在 `LocalState` 和 `initialLocal` 里加字段。
3. 在 `paintScreen.ts` 里画这一页。换页时让 `paint.ts` 末尾算出的 `screenPage` 随之变化，引擎才会从上到下重写屏幕。
4. 检查记忆化：新状态必须改变 `displayState` 或 `paintKey`。
5. 脱机时是否应该保留，在 `terminalView()` 里决定；私密内容一律收回。
6. 在 `MobileConsole.tsx` 里显示同样的信息。
7. 在 `previewState()` 里加一个场景，就能不连服务器直接打开这一页，见[开发预览](preview.md)。把场景名加进 `i18n.test.mjs` 的 `phases`，两种语言的覆盖就会自动检查。

### 加一条文案

1. 在代码里写中文原文，用 `t()` 或 `translate()` 包起来。
2. 在 `i18n.ts` 的 `messages` 里加英文，键和中文原文逐字相同。
3. 运行 `pnpm test`。`i18n.test.mjs` 会在英文界面里找残留的中文，漏翻的文案会让它失败。
