# Handoff：控制台渲染功耗优化（第一版：氛围帧只重画在动的区域）

> 写给接手这次优化的 session。读完就能开工，不需要翻之前的对话。
> 文中数字都是 2026-09-29 在用户机器上实测的；测量脚本在 `web/scripts/perf/`（附录有清单）。
> 代码基线：`feature/let-gpt6-impl` 分支，提交 `16ea62c`。

## 0. 任务定义

**问题**：高档画质下 GPU 功耗长期居高不下。用户用的是 14 英寸 MacBook Pro（M4 Max，120 Hz），外接一台 5K 显示器（UI 2560×1440，2×），5K 屏上全窗口时画布是 5120×2600。在这块屏上，停手时 GPU 功耗约 +7 W，窗口在后台约 +5 W，动鼠标或拧旋钮时 +11～30 W。表现是风扇转、机身热，交互时还会掉帧（见 1.2）。

**做法**：氛围帧只让显像管扫描线和光标、示波器光点、辉光管呼吸、接收机指针这几样东西动。这种帧不再整幅重画：先把上一整帧铺回去，只在这几块区域里重新渲染。有真实变化的帧（旋钮、纸带、翻面、状态更新等）照旧整帧重画。

**硬性要求**

1. 画面逐像素不变：同一状态下，局部帧和整帧的像素完全相同。
2. 有真实变化的帧，时机和代价都不变：交互照旧每帧都画，不缩短，不降帧。
3. 不动 `qualityProfiles`，不加新的可见设置。
4. 如果某个浏览器上局部帧保证不了正确（比如拷贝画面失败），就退回整帧，不能出错。

**本版范围**

- 必做：局部帧（第 3 节）、DEV 工具（第 5 节）、纯逻辑的单元测试、文档（第 7 节）、改前改后的实测（第 6 节）。
- 建议顺手做（风险低）：机器翻到背面时不画氛围帧；LED 词窗的跑马灯改按氛围节奏（3.6）。
- **不做**：下面几项都会改变外观，需要用户另行拍板（数据见第 8 节）——去掉或替换两盏面光源、关 MSAA、限制分辨率、高档氛围帧从 60 降到 30。

**验收**（细节见第 6 节）

- `?partial=verify` 下，6.3 列出的所有场景里，局部帧和整帧 0 像素差异。
- 5K 高档，用 `power.mjs` 在同一轮里交替开关：打开局部帧后，停手和动鼠标两种状态的 GPU 功耗都至少降 60%，窗口在后台时至少降 50%；帧率不变（30/60/20）；拧旋钮时功耗不升高。
- `pnpm test`、`pnpm build` 通过，控制台没有新的报错。

## 1. 为什么要这样改（实测摘要）

### 1.1 看功耗，不看"GPU 占用"

M4 Max 的 GPU 有 15 档频率，从 338 到 1578 MHz（读自 `ioreg -r -n pmgr` 的 `voltage-states9`）。macOS 会自动调频：活少就降频，活多才升频。所以各种配置在活动监视器里的"GPU 占用"都差不多（30 帧时都在 15–30%），功耗却能差 15 倍。高档每一帧的活太多，把 GPU 逼到 1.2–1.5 GHz；频率越高电压越高，同样的活耗电多得多。

**本任务一律用瓦数衡量。** `web/scripts/perf/iowin.py` 不用 sudo 就能读到（数据来自 IOReport，和 `powermetrics` 同源）。它读的是整机数值，要扣掉同一轮里测的基线。

### 1.2 现状（5K，高档，引擎自己的节奏）

由 `power.mjs` 测得，GPU 功耗已扣除基线：

| 状态 | 帧率 | GPU 功耗 |
| --- | --- | --- |
| 停手超过 10 秒 | 30 | +6.5～9 W |
| 鼠标在页面上移动 | 60，GPU 停在低频时掉到约 49 | +11～30 W，中位数约 19 W |
| 拧旋钮（每帧都是整帧） | 60，GPU 停在低频时掉到约 46 | +10～27 W |
| 窗口在后台 | 20 | +4.8～7 W |
| 机器断电 | 0 | 0 |

- 60 帧的两种状态波动很大：GPU 有时停在 500–700 MHz，这时帧率掉下来、功耗约 10 W；有时升到 1.3–1.5 GHz，这时帧率满、功耗 20～30 W。
- 内建屏（画布 3024×1800）约为 5K 的三分之一：60 帧 +5.4 W，30 帧 +3.0 W。

### 1.3 一帧的钱花在哪（5K，背靠背满频渲染）

由 `frame-cost.mjs` 测得。高档一帧的 GPU 时间约 7～9 ms，其中：

- **逐像素光照占 79%**：把所有材质换成纯色，一帧只剩 1.44 ms。66 万个三角形的几何处理只占约 5%。
- 分项（有重叠，不能相加）：
  - 两盏面光源（`RectAreaLight`）：41–53%
  - 4× MSAA：约 39%，其中固定的清除和解析约 0.9 ms
  - 环境反射：约 12%
  - 背景墙：约 12%
  - 阴影：9%
  - 显像管玻璃：7.5%
- 苹果 GPU 的隐藏面剔除是生效的：在镜头前先画一块不透明挡板，一帧从约 7 ms 降到 1.7 ms。被挡住的像素不花钱。

### 1.4 关键事实：氛围帧里几乎什么都没变

相邻两个氛围帧之间，只有约 0.3% 的像素发生变化。一秒内累计，也只有 7–8% 的 32 px 方块动过，全都在四处：主屏上有字的行、示波器屏、辉光管、接收机表盘（`dirty-map.mjs` 能生成标注图）。可是现在每个氛围帧都把 100% 的像素连同影棚光照重算一遍。

### 1.5 原型

`partial-prototype.mjs` 对今天的代码就能运行。16 个会动的物体归成 9 个矩形，占画面 23%。

- 精确性：连续 4 个"整帧 → 推进状态 → 局部帧"的周期，和整帧逐像素比对全部 0 差异，包括载入后的第一个局部帧。
- 功耗（5K，同一轮交替测量）：

| | 现状（1.2） | 原型的整帧（每帧都拷贝一次） | 原型的局部帧 |
| --- | --- | --- | --- |
| 30 帧 | +6.5～9 W | +7.5～8.4 W | **+2.0～2.6 W** |
| 60 帧 | +11～30 W | +17.5～18.3 W | **+3.6～4.1 W** |

`docs/console/quality.md` 里有一句"把氛围帧裁剪到几块屏幕的范围内，只省了大约五分之一"，这个结论不成立。差别在做法上，见 4.1 和 4.3。

## 2. 现在的帧循环（改动的起点）

以下都在 `web/src/console/engine.ts`：

- `tick()`（393 行起）：各部件的 `tick()` 返回 `Effect` 标志（定义在 `parts/chassis.ts` 23 行）。
  - `ambient`：只有自己在动的东西变了（指针、电子束）。
  - `redraw`：立即画。
  - `shadow`、`project`：立即画，并分别重投阴影、重新投影 DOM 控件。
- `changed = this.apply(effect)`：表示这一帧带有 `redraw` 位。
- 是否要画：`due = visible && (changed || dirty || probing || (live || ambientOwed) && 到了氛围节奏)`，其中 `live = powered && !reduced`。
- 氛围节奏由 `quality.ts` 的 `ambientRate()` 决定。高档：有输入时 60 帧，停手 10 秒后 30 帧，后台 20 帧。
- 每帧都会发生的更新：
  - `due` 且正面朝前时，调用 `scope.draw()`（示波器画布和贴图）和 `lamps.lock()`（LOCK 灯亮度）。
  - 每个 tick 调用 `nixies.breathe()`（辉光管透明度）。
  - `displays.tick()` 更新显像管的时间 uniform。扫描线、闪烁、颗粒、光标闪烁都靠它。
- 渲染：`due` 时调用 `renderer.render(scene, camera)`，也就是整帧。另外还有两处直接渲染：
  - `resize()`（341 行）：ResizeObserver 触发后立即补画一帧。
  - `frameCost()`：自动档测速时背靠背连续渲染。
- 已有睡眠机制：没有东西在动时，循环会睡到下一个氛围帧，由 `wake()` 唤醒。

也就是说，"氛围帧"在代码里已经区分出来了（`due` 只因节奏成立的帧），只是画法和整帧一样。

## 3. 设计

### 3.1 两种帧

每个 `due` 的 tick 二选一：

- **局部帧**：同时满足以下所有条件时才画。
  - `partialRedraw` 开着；
  - 上一整帧的副本有效（见 3.2）；
  - 这一帧没有 `changed`、没有 `dirty`，也不在测速；
  - `renderer.shadowMap.needsUpdate` 为假。
- **整帧**：其余一律整帧，和今天完全一样。

把这个判定写成不依赖 three.js 的纯函数，放进一个新模块，并在 `web/scripts/` 下加 `*.test.mjs` 测试它。项目约定：测试在 Node 里跑，被测逻辑不能 import three 或 DOM（参考 `scripts/load.mjs`）。矩形的外扩、裁剪、合并也放在同一个模块里测。

### 3.2 上一整帧的副本

- **形式**：一张 `THREE.FramebufferTexture`，尺寸等于 `renderer.getDrawingBufferSize()`；尺寸一变就重建。
- **何时拷贝**：
  - 整帧画完后，在同一个 tick 里立刻调用 `renderer.copyFramebufferToTexture(texture)`。必须赶在浏览器呈现这一帧之前：画布默认 `preserveDrawingBuffer: false`，出了这个任务，画布内容就读不到了。
  - 只在这一帧没有 `changed`、也不是测速时拷贝，也就是画面接下来会停住的时候。零件还在动的整帧不拷贝，并把副本标为无效。
  - 这样连续交互时不增加任何开销；动作停下后的第一帧本来就是整帧，顺带拷贝一次。
- **何时作废**：
  - 调用 `resize()`、`setQuality()` 或 `applyQuality()` 时；
  - 调用 `probe()` 或 `frameCost()` 时；
  - `partialRedraw` 从关变成开时；
  - 画布尺寸变化时；
  - 在 `tick()` 之外发生任何一次 `renderer.render()` 时。
- **失败时退回**：拷贝后检查 `gl.getError()`。一旦出错，本页永久关闭局部帧，DEV 下用 `console.warn` 说明原因。画布是 `alpha: false`，个别浏览器可能不允许从 RGB 默认帧缓冲拷到 RGBA 贴图，Safari 和 Firefox 都要实测（见 6.4）。
- **原样铺回**：副本存的已经是色调映射、sRGB 编码之后的最终字节，铺回去时必须原样输出（用 3.3 里的着色器）。

### 3.3 局部帧的画法（原型已验证，照这个写）

```ts
const r = this.renderer, depth = r.state.buffers.depth;
r.autoClear = false;
r.setScissorTest(false);
// 通道一开始就把深度清成 0：矩形外的片元过不了深度测试，不会被着色。
depth.setClear(0); r.clear(true, true, true); depth.setClear(1);
r.render(stillScene, stillCamera);            // 铺回上一整帧（只写颜色）
r.setScissorTest(true);
for (const [x0, y0, x1, y1] of rects) {       // 矩形内把深度清回 1
  r.setScissor(x0, y0, x1 - x0, y1 - y0); r.clear(false, true, false);
}
r.setScissorTest(false);
// 场景背景是纯色时，three 每次 render 前都会强制清屏，会把上面的一切抹掉（见 4.1）。
r.autoClearColor = r.autoClearDepth = r.autoClearStencil = false;
r.render(this.scene, this.view.camera);        // 几何只跑一遍
r.autoClearColor = r.autoClearDepth = r.autoClearStencil = true;
r.autoClear = true;
```

铺回副本用的四边形：

```ts
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { map: { value: still } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
}));
quad.frustumCulled = false;   // 放进单独的 Scene，配一个 OrthographicCamera
```

为什么逐像素一致：矩形内是完整渲染，透明物体的排序、玻璃和辉光的叠加都和整帧一样；矩形外的像素直接来自副本。MSAA 照常工作。

### 3.4 动态区域

矩形来自"会在氛围帧里改变像素的物体"。原型用的清单：

| 来源 | 物体 | 为什么会变 |
| --- | --- | --- |
| 显像管 | `chassis.planes` 中 `displays.has(name)` 为真的平面：主屏、示波器、4 个词窗，包括它们的子节点玻璃 | 通电时时间 uniform 每帧都在变（扫描线、滚动带、闪烁、颗粒、光标闪烁、信号扰动）；示波器每帧换一张贴图 |
| 辉光管 | `NixieBay` 的 4 块辉光面和 4 块光晕（`AdditiveBlending` 的 `MeshBasicMaterial`） | `breathe()` 每个 tick 都改 opacity |
| LOCK 灯 | 所有使用 `lamps.scope.material` 的网格 | `lock()` 每个绘制帧都改 emissiveIntensity |
| 接收机指针 | 整块表盘玻璃 `SignalGlass`，而不是指针本身 | 指针一直在扫。矩形必须同时盖住它离开的位置和到达的位置；原型只用指针自身的包围盒时，留下了 23–62 个像素的残影 |

规则：

- 让相关部件各自提供自己的氛围区域（比如 `ambientRegions(): THREE.Object3D[]`），由引擎汇总，不要在引擎里按名字硬编码。
- 从物体算出矩形：
  1. 取物体（含子节点）几何包围盒的 8 个角，用相机投影；
  2. 换算成画布的 CSS 像素，原点在左下角（这是 `renderer.setScissor` 的约定）；
  3. 每边外扩 6 px，裁到画布之内；
  4. 相交的矩形合并；落在画面外或背对镜头的丢掉。
- 什么时候算：每次拷贝副本时算一次，和副本存在一起。相机、视口和零件位置一变就会画整帧，所以副本有效期间，矩形不会过期。
- 可选优化：词窗在 LED 模式下只有开关机过渡或跑马灯时才会变，静止时可以不放进清单（4 个词窗合计约占画布的 4%）。
- **以后新增任何氛围效果，都必须登记区域**，否则它在局部帧里会冻住。校验模式（5.3）能抓出漏登记的区域。

### 3.5 和现有机制的关系（逐条确认过）

- 氛围节奏（`ambientRate`）、循环睡眠、`wake()`：不变。局部帧只改变"怎么画"，不改变"什么时候画"。
- 自动档测速（`probe()`、`frameCost()`）：测的是整帧，不变；测完作废副本。
- 断电、减少动态效果：本来就没有氛围帧，不受影响。
- 纸带阅读器打开（`archiveOpen`）时：氛围帧照常，局部帧也照常。阅读器背后的 CSS 模糊会随画布每帧重算，实测每帧约 0.3 ms，60 帧时约 +0.3 W，不构成问题。
- `/preview` 页面的自由视角：旋转、缩放期间画整帧；停下后第一帧拷贝副本，之后画局部帧。
- 翻到背面（`view.frontInView` 为假）：背面没有氛围动画，这时的氛围帧可以直接跳过（见 3.6）。
- 页面隐藏：不画；恢复后副本仍然有效。
- 阴影贴图：只在整帧里更新。有待更新的阴影（`shadowMap.needsUpdate`）时一律画整帧。
- WebGL 上下文丢失：引擎现在会直接报错，不需要额外处理。

### 3.6 建议顺手做的两件小事

1. **背面朝前时跳过氛围帧**：如果 `due` 只是因为到了氛围节奏，而且 `!view.frontInView`，就不渲染。
2. **LED 跑马灯改按氛围节奏**：
   - 现状：关键词比 LED 模块宽、需要滚动时，`dotMatrix.ts` 的 `DotDriver.moving` 一直为真，于是 `Displays.tick()` 每帧都返回 `Effect.redraw`，整帧按显示器刷新率重画，完全绕过氛围节奏。实测模拟一个滚动的词，停手时从 30 帧变成了 60 帧整帧。
   - 影响：现有词库用真实字体测过，中英文下 754 个词里没有一个需要滚动，所以目前不会触发。
   - 改法：滚动本身按 `Effect.ambient` 上报，并把词窗放进区域清单；开关机、装载等过渡仍然报 `redraw`。

## 4. 已知的坑（务必处理）

1. **纯色背景会强制清屏。**`scene.background` 是 `Color` 时，three 的 `WebGLBackground` 每次 `render()` 前都会清掉颜色、深度和模板，不管 `autoClear` 是什么。局部帧里必须把 `autoClearColor`、`autoClearDepth`、`autoClearStencil` 都设为 false，否则铺回的副本和深度遮罩都会被抹掉，这一帧实际上就成了整帧。原型第一次就栽在这里：局部帧的功耗和整帧一模一样。
2. **不要用 `preserveDrawingBuffer`。**它和 4× MSAA 一起用时，多重采样数据每帧都要写回内存，整帧功耗涨三到五成（5K、30 帧时从 8.6 W 涨到 13.1 W）。副本贴图的做法没有这个问题。
3. **不要每个矩形各渲染一遍场景。**那样每个矩形都要把 66 万个三角形的几何处理重跑一遍：9 个矩形在 60 帧时仍要约 +8 W。按 3.3 用深度遮罩，几何只跑一遍，60 帧时是 +3.6～4.1 W。
4. **深度清成 0，放在通道开头和颜色一起清**，这是原型的做法。放在铺完副本之后再清的代价没有单独测过，照原型写即可。
5. **拷贝必须紧跟整帧**，在同一个任务里完成。也不要每个整帧都拷：在 5K 加 MSAA 下，每次拷贝都要多做一次解析。原型每帧都拷，60 帧的整帧约 +18 W；不拷的整帧大约 +15 W（不同轮次的数，只供参考）。按 3.2 的时机，每次停顿只拷一次。
6. **指针的区域要盖住它扫过的整个范围**（表盘），否则会留下残影。
7. **共享材质。**某个材质要是在氛围帧里被改动（比如 LOCK 灯的 emissive），所有用这个材质的网格都得在区域里。静态网格会按材质合批（`chassis.batch()`），改动前先确认这个材质没有被合进大批次。原型里 LOCK 灯的材质只有它自己在用。
8. **副本要原样铺回。**它已经是色调映射、sRGB 编码之后的字节。用 3.3 的 `ShaderMaterial`（其中不含颜色空间和色调映射的代码片段），不要用 `MeshBasicMaterial`，后者会再做一次颜色空间转换。原型里原样铺回和原帧 0 差异。
9. **切换点也要校验。**原型早期的一个版本，在"载入后第一个局部帧"上出现过一次矩形内的细微差异（平均 1.3 个色阶，原因没查清）；最终版本 4 个周期全部 0 差异。实现之后，校验模式要覆盖每一个"整帧 → 局部帧"的切换点，不能只看稳态。
10. **测量噪声。**"GPU 占用"会误导（见 1.1）。另外，其他程序和 GPU 当时的频率都会让单次读数差 ±20%；用户机器上常开着一个约占 8% GPU 的 `Game.exe`。60 帧时 GPU 在低频和高频两种状态之间跳（见 1.2），波动更大。一定要在同一轮里交替测，取中位数；60 帧的状态至少测 5 轮。

## 5. DEV 工具（先做，测量和校验都要用）

这些只在 `import.meta.env.DEV` 下存在，生产构建里不能有。

1. **`window.__consoleEngine`**：引擎实例。`web/scripts/perf/` 下的脚本都通过它读写引擎，下面这些名字要保持可用，或者同步修改脚本：`lastInput`、`tick`、`raf`、`sleep`、`wake()`、`scene`、`view.camera`、`renderer`、`quality`、`setQuality()`、`chassis`、`displays`、`nixies`、`lamps`、`instruments`、`scope`、`studio`。
2. **`engine.partialRedraw`**：布尔值，默认 true。运行时开关，`power.mjs` 用它在同一个页面里交替做 A/B。
3. **URL 参数 `partial=off|verify`**：
   - `off`：整页只画整帧。
   - `verify`：每画完一个局部帧，读回整幅画面，再画一遍整帧、读回，逐像素比较。不一致就 `console.warn`，附上像素数和包围盒，并累加到画布的 `data-partial-mismatch`。
   - 校验模式很慢（5K 下每帧要读回两次各约 5000 万字节），只用来检查。
   - 这个参数要写进 `docs/console/preview.md` 的"其他参数"。
4. **画布上的计数**：`data-full-frames`、`data-partial-frames`，都是累计值，和现有的 `data-scope-fps` 等一起每 750 ms 更新。`power.mjs` 会优先用它们数帧。

## 6. 测量与验收

### 6.1 准备

```bash
cd web && pnpm dev                          # :3000
cd web/scripts/perf && ./chrome.sh          # 无头 Chrome，用真实 GPU，CDP 端口 9555
caffeinate -dimsu node power.mjs --size 2560x1300@2 --rounds 5
```

- 所有测量都要套 `caffeinate -dimsu`：显示器一睡，rAF 就停了。
- 一次只跑一个探针。`cdp.mjs` 连接时会先关掉残留页面：崩掉的运行留下的页面会在后台一直画，污染之后的所有读数。
- 显示器睡过之后，Chrome 可能会失效（日志里出现 `CVDisplayLinkCreateWithCGDisplay failed`），这时重跑 `./chrome.sh`。
- 画布尺寸：5K 屏全窗口用 `--size 2560x1300@2`，内建屏用 `--size 1512x900@2`。

### 6.2 改之前先测基线

1. 先只加 5.1 的引擎句柄，别的都不动。
2. `node power.mjs --size 2560x1300@2 --rounds 5`：记录四种状态的基线，应该和 1.2 接近。
3. `node partial-prototype.mjs --size 2560x1300@2 --rounds 3`：得到原型的精确性和功耗，作为目标。
4. 分别用 `node dirty-map.mjs --preview late-game` 和 `--preview encrypting` 看哪些区域在变，和 3.4 的清单对照。

### 6.3 改完之后：精确性

在 `?partial=verify` 下逐个检查。要求 `data-partial-mismatch` 为 0，控制台没有警告。

- **夹具**：`home`、`room`、`encrypting`、`listening`、`intercept`、`decrypt`、`round_result`、`game_over`、`late-game`。
- **配置组合**：
  - 词窗：LED（默认）和 CRT（`?words=crt`）；
  - 语言：中文和英文；
  - 画质：高、中、低（低档用的是简化光学）。
- **操作之后回到静止**：
  - 拧每个旋钮，然后停手；
  - 拔出纸带，打开并关闭阅读器；
  - 翻到背面再翻回来；
  - 断电再通电；
  - 拖动改变窗口大小；
  - 切换画质、切换主题；
  - 在 `/preview` 旋转、缩放后停下；
  - 切到别的标签页再切回来。
- **一局真实对局**（后端加 AI 玩家）：倒计时走秒、别人输入时的实时进度、回合结算。
- **切换点**：载入后的第一个局部帧，以及每一次"整帧 → 局部帧"。

### 6.4 改完之后：功耗和帧率

运行 `node power.mjs --size 2560x1300@2 --rounds 5`。引擎有 `partialRedraw` 时，脚本会自动交替开关。要求：

- 停手和动鼠标：开比关至少低 60%；窗口在后台：至少低 50%。
- 帧率和关掉时一样：停手 30，动鼠标 60，后台 20。
- 拧旋钮：开不高于关。交互帧仍然是整帧，副本只在停下后拷一次。
- 用内建屏的尺寸再跑一遍。
- Safari 和 Firefox：用 `?partial=verify` 打开，确认 0 差异，或者局部帧因为拷贝失败已经自动关闭（DEV 下能看到原因）。无头测量只覆盖 Chrome。

### 6.5 其他

- `pnpm test`、`pnpm build` 通过；新的纯逻辑模块有测试。
- 生产构建里没有 `__consoleEngine`，也不处理 `partial` 参数。`options.ts` 里现有的 DEV 参数就是这样做的。
- 提交信息沿用现有格式，例如 `perf(console): redraw only what moves in ambient frames`。

## 7. 要同步更新的文档

文档用中文，只描述现状，不写变更记录。

- `docs/console/quality.md`：
  - "氛围帧与闲置"一节：加上局部帧。写清什么时候画局部帧、副本什么时候拷贝和作废、动态区域有哪些、新效果怎么登记。
  - "实测 / 闲置的开销"一节：删掉"只省了大约五分之一"那段，换成新的实测。用功耗来衡量，并说明为什么不看占用率。
  - "开发时查看"一节：加上新的 `data-` 属性、`?partial=` 参数，以及 `web/scripts/perf/` 的用法。
- `docs/console/code.md`：
  - `Effect` 表里补充 `ambient` 的含义：现在它还意味着"只在区域内重画"。
  - 写清部件如何声明氛围区域，并把新模块加进文件表。
  - "新增会动的零件"的步骤里加一步：会自己动的东西要登记区域。
- `docs/console/preview.md`："其他参数"一节加上 `partial`。

## 8. 已经测过、但不在本版的选项

这些会改变外观，需要用户决定。数据是 5K、30 帧、同样的测法：

| 选项 | GPU 功耗 | 外观变化 |
| --- | --- | --- |
| 现状（高档） | +8.6 W | — |
| 关掉两盏面光源（其余灯光强度乘 1.26，也就是中档的做法） | +3.0 W | 辉光管玻璃和面板上柔和的反光没了 |
| 关掉 4× MSAA | +5.7 W | 指针、刻度这类细斜线有轻微锯齿；换成 FXAA 会把小字弄糊，还要多一道离屏渲染 |
| 像素比从 2 降到 1.5 | +3.8 W | 主屏文字略软 |
| 1.5 倍像素比，再关 MSAA | +2.1 W | 上面两项的变化叠加 |
| 高档氛围帧从 60 降到 30 | 只影响动鼠标时，约 15 → 8.6 W | 扫描线、示波器、指针变成每秒刷新 30 次；交互动作仍是 60 帧 |

补充说明：

- 按总像素封顶，只有上限设在约 750 万像素时才有效果。5K 全窗口是 1330 万像素，全屏是 1470 万，像 1600 万这样的上限永远不会触发。
- 局部帧和这些选项可以叠加。例如局部帧再加关 MSAA，30 帧约 +1.8 W。
- 交互帧仍然是整帧，拧旋钮时 60 帧要 +10～27 W。以后可以考虑让零件的移动也只重画它所在的区域，但阴影也会跟着变，复杂得多。

## 附：`web/scripts/perf/` 清单

| 文件 | 用途 |
| --- | --- |
| `chrome.sh` | 启动无头 Chrome，用真实 GPU；端口由 `CDP_PORT` 指定，默认 9555 |
| `cdp.mjs` | CDP 客户端：打开控制台页面、等待引擎句柄、解析命令行参数；连接时关掉残留页面 |
| `gpu.mjs` | 某个进程在 GPU 上的忙碌时间（读 ioreg，不用 sudo） |
| `iorep.py`、`iowin.py` | 整机的 GPU、CPU、DRAM 功耗，以及 GPU 平均频率（读 IOReport，不用 sudo） |
| `power.mjs` | 验收用：在引擎自己的节奏下，测停手、动鼠标、拧旋钮、后台四种状态的帧率、占用和功耗；有 `partialRedraw` 时自动交替开关 |
| `frame-cost.mjs` | 背靠背满频渲染下，每个开关占一帧的比例 |
| `dirty-map.mjs` | 氛围帧里哪些像素在变，输出标注图 |
| `partial-prototype.mjs` | 局部帧的原型，对今天的代码可以直接运行：精确性检查加功耗对比 |

这些脚本都依赖 5.1 的 `window.__consoleEngine`，默认连接 `http://127.0.0.1:3000`，可以用 `--url` 改。
