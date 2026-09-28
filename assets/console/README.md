# 建模流水线

这里是密报终端 3D 模型的源文件和生成脚本。本文只讲怎样改模型、怎样导出。机器在页面里的表现见 [`docs/console/`](../../docs/console/README.md)：[显示器件](../../docs/console/displays.md)、[机械与交互](../../docs/console/mechanics.md)、[背面联动](../../docs/console/rear-linkage.md)、[画质与性能](../../docs/console/quality.md)、[开发预览](../../docs/console/preview.md)、[代码组织](../../docs/console/code.md)。

## 目录内容

| 文件 | 说明 |
| --- | --- |
| `decrypto-console.blend` | 整机的可编辑源文件，几何以它为准。文件名沿用历史名称 |
| `instrument-studies.blend` | 三种仪表方案并排摆放的独立源文件，由 `build_instrument_studies.py` 生成 |
| `textures/` | 脚本生成的 512 px PBR 贴图（颜色、法线、粗糙度），同时打包进 `.blend` 和 GLB |
| `*.py` | Blender 工序脚本，见[脚本一览](#脚本一览) |
| `console_parts.py` | 各工序共用的建模函数（`box`、`cylinder`、`ring`、`material`、`finish`） |
| `scoreLamps.json` | 计分灯方案的尺寸，只供 `refine_score_lamps.py` 读取 |

计分翻牌的尺寸和颜色在 `web/src/console/scoreRegister.json`，由 `refine_score_register.py` 和前端共用。

导出结果放在 `web/public/models/`：

| 文件 | 大小 | 何时加载 |
| --- | --- | --- |
| `decrypto-console.glb` | 约 9.9 MB | 正式页面，整机模型 |
| `console-surfaces.json` | 约 8 KB | 正式页面，画面和点击区域的位置表 |
| `instrument-studies.glb` | 约 1.3 MB | 只在开发环境的仪表对比台加载 |
| `instrument-vu.glb` | 约 1.5 MB | 只在开发环境的仪表对比台加载，是被替换下来的 VU 表 |

## 坐标和单位

脚本使用机器坐标：x 向右，y 向上，z 朝向玩家，单位是任意的「机器单位」。Blender 里对应 `(x, -z, y)`，glTF 导出器再把它转回 Three.js 的坐标。机器正面在 z ≈ 0.55，背面朝 −z。

## 两种改法

### 在 Blender 里手工修改

1. 打开 `decrypto-console.blend`，修改，保存。
2. 导出 glTF Binary 到 `web/public/models/decrypto-console.glb`。导出设置与脚本一致：
   - 应用修改器（倒角等修改器在源文件里保持可编辑）；
   - 只导出可渲染对象，布尔切割体因此不进入 GLB；
   - 开启 Draco 压缩（压缩级别 6，位置量化 16 位，法线量化 12 位）；
   - 不导出相机和灯光；
   - 导出自定义属性（extras）。
3. 导出前把 40 个 `Nixie_Digit_*` 全部设为可见、可渲染，导出后再恢复。源文件平时只点亮演示房间码 5821。
4. 位置变了的画面或点击区域，要同步修改 `console-surfaces.json`。
5. 按[导出之后](#导出之后)检查。

### 运行可重复的工序

每个工序脚本打开当前的 `.blend`，只重建自己负责的部件，然后保存 `.blend`、导出 GLB，需要时更新 `console-surfaces.json`。在仓库根目录运行，例如：

```sh
blender -b -t 1 --factory-startup assets/console/decrypto-console.blend --python assets/console/refine_visual_polish.py
```

工序用三种办法保证可以重复运行：先删除带自己前缀的对象再重建；把部件的原始位置存进自定义属性，每次都从原始位置算起；改过形状的网格打上标记，下次跳过。

> **`build_console.py` 会重建基础模型并覆盖 `.blend`、GLB 和位置表，之后的手工修改和所有工序成果都会丢失。** 日常修改不要运行它。

## 脚本一览

下表按运行顺序排列。从基础模型重建时按 0 到 21 依次运行；平时只重跑要改的那一个工序，然后再运行一次 `refine_visual_polish.py`。

最后补跑 `refine_visual_polish.py` 有两个原因：

- 多数工序会按自己的原始配色重建材质和贴图，暖中性色要由它重新套上；
- 早期工序写于辉光管加入之前，导出时不处理 40 个数字的可见性，需要由后期工序重新导出。

### 基础和早期工序

| 顺序 | 脚本 | 负责的部件 | 可重复 | 自检 |
| --- | --- | --- | --- | --- |
| 0 | `build_console.py` | 基础机身、基础位置表 | 会覆盖全部成果 | 无 |
| 1 | `refine_scope.py` | 示波器细节（`ScopeDetail_` 对象） | 是 | 缺少 `ScopeTuning` 时拒绝导出 |
| 2 | `refine_console.py` | 面板上的通用仪器细节（`ConsoleDetail_` 对象） | 是 | 无 |
| 3 | `remodel_instrument.py` | 机身结构：空心铸件边框、折弯外壳、百叶窗、同轴线、背面检修面板和背面字样 | 是 | 无 |
| 4 | `remodel_front.py` | 正面各组件：名牌架、八张名牌、计分区、打印机框架 | 是 | 无 |
| 5 | `refine_front_mechanics.py` | 第一批活动部件：按键帽、纸带、发报键等 | 是 | 无 |
| 6 | `refine_tactile.py` | 材质贴图、可拆卸硬件：电池、插头、线缆、触点 | 是 | 无 |
| 7 | `refine_score_roster.py` | 正面饰面、计分板拉丝镍、顶部装卡的名牌架 | 是 | 无 |
| 8 | `refine_roster_manual.py` | 名牌固定卡扣、实心的手册键 | 是 | 名牌行程由前端测试核对 |
| 9 | `refine_front_layout.py` | 正面布局：软驱移到底部导轨、发报键的哑光红树脂 | 是 | 无 |
| 10 | `refine_panel_layout.py` | 英文面板字样、顶部电源拨杆、小 CRT 和旋钮排布、底部通风槽 | 是 | 运行 `validate_power_clearance.py`；检查拨杆朝上；44 条射线检查通风槽通透，并检查槽间金属 |

### 后期工序

| 顺序 | 脚本 | 负责的部件 | 可重复 | 自检 |
| --- | --- | --- | --- | --- |
| 11 | `refine_nixie_recorder.py` | 四支辉光管（40 个数字阴极）、纸带进纸口对位、缩短的电源拨杆 | 是 | 无 |
| 12 | `refine_nixie_cover.py` | 辉光管下沉的凹槽、整块亚克力罩 | 是 | 管体不超出机面；管座穿过托架；与计分区的间距；12 条射线检查凹槽 |
| 13 | `build_instrument_studies.py` | 三种仪表方案，输出 `instrument-studies.blend` 和 `instrument-studies.glb`，不改整机 | 是 | 转鼓、拨杆的扫掠空间不碰底板、玻璃和孔壁 |
| 14 | `install_receiver.py` | 把选定的 SIGNAL 接收机装进整机；旧 VU 表另存为 `instrument-vu.glb` | 是 | 接收机部件归属；40 个数字 |
| 15 | `refine_scope_drive.py` | 示波器旁的同轴跳线、手动软驱机构 | 是 | 40 个数字随导出保留 |
| 16 | `refine_scope_controls.py` | 示波器四个旋钮的排布和刻字（FREQ、WAVE、TIME/DIV、X-Y）、LOCK 灯 | 是 | 刻字朝向操作者；每条字样唯一 |
| 17 | `refine_score_lamps.py` | 计分灯方案（已被计分翻牌取代，见下） | 是 | 40 个数字 |
| 18 | `refine_score_register.py` | 四个双窗计分翻牌、八个 `ScoreFlag_*` 转轴 | 是 | 翻牌转动空间不碰背板和玻璃；40 个数字 |
| 19 | `refine_rear_audio.py` | 背面 MUSIC、SFX 两个滑钮 | 是 | 40 个数字 |
| 20 | `refine_handles.py` | 两侧把手，每侧一根弯管，螺丝固定在背板 | 是 | 40 个数字 |
| 21 | `refine_visual_polish.py` | 暖中性色、背面格栅、各处边距和字样位置 | 是 | 贴图生成结果与已打包贴图一致；40 个数字 |

`refine_score_register.py` 运行时会删除所有 `ScoreLamp_*` 对象，已发布的模型里没有计分灯。`refine_score_lamps.py` 和 `scoreLamps.json` 只作为被取代的方案保留。

`install_receiver.py` 依赖 `instrument-studies.blend`。接收机的几何有改动时，先运行 `build_instrument_studies.py`。

### 辅助脚本

| 脚本 | 用途 |
| --- | --- |
| `validate_power_clearance.py` | 电源拨杆在 32 度行程内取 65 个姿态，检查与机壳、衬套、字牌不相交，最小间隙不低于 0.045。由 `refine_panel_layout.py` 在保存前调用 |
| `preview_switch.py` | 渲染电源拨杆特写，供目视检查。`-- /tmp/switch.png off` 渲染关机姿态 |

`refine_scope_controls.py` 支持试导出：`-- --dry /tmp/out.glb` 只写出一份 GLB，不保存场景，不改位置表和已发布的模型。

## 与运行时的约定

前端按名称查找部件（`web/src/console/engine.ts`、`instruments.ts`）。名称里的空格可以写成下划线。改模型时这些名称、层级和原点要保持不变。

### 必须存在的组件

缺少下列任一组件，页面载入时报错：

`FloppyTransport`、`ScopeTuning`、`ScopeWave`、`ScopeRate`、`ScopePersistence`、`BatteryDoor`、`PowerSwitch`、`Instrument_signal`、`RearTestLamp`。

### 活动部件

| 名称 | 运行时的用法 |
| --- | --- |
| `FloppyTransport`、`Floppy disk`、`FloppyEject` | 软盘沿 `travel_axis` 进出；弹出键独立下压。固定的软驱外壳不属于 `FloppyTransport` |
| `ScopeTuning`、`ScopeWave`、`ScopeRate`、`ScopePersistence` | 示波器四个旋钮，绕自身原点转动 |
| `PowerSwitch` | 电源拨杆，行程取自 `throw_degrees` |
| `TransmitLever` | 红色发报键，直线下压。名称是为兼容保留的 |
| `Key_0` … `Key_4` | 数字键 1–4 和退格键 |
| `ManualKey`、`ChannelCopy` | 手册键、房间码复制键 |
| `RosterCard_A0` … `RosterCard_B3` | 八张名牌，行程取自 `travel` |
| `ScoreFlag_{A,B}_{intercept,failure}_{0,1}` | 八个计分翻牌的转轴 |
| `Nixie_Digit_{管位}_{数字}` | 40 个数字阴极，每支管同时只显示一个 |
| `Instrument_signal` 下的 `SignalNeedle`、`SignalTuning`、`SignalGain`、`SignalSweep` | 接收机的指针、两个旋钮、AUTO/MAN 拨杆 |
| `SignalGlass` | 表盖，运行时换成微凸的玻璃 |
| `PaperFeed`、`Paper back`、`Paper roller`、`Printer opening` | 纸带、辊轴和出纸口。`Paper back` 必须是 `PaperFeed` 的子对象 |
| `BatteryDoor`、`BatteryCell_0` … `BatteryCell_3` | 电池仓盖和四节电池。电池不属于仓盖 |
| `CablePlug_RJ45`、`CablePlug_Serial`、`CablePlug_DC` | 三个背面插头 |
| `Tactile_RJ45 flexible lead`、`Tactile_Serial flexible lead`、`Tactile_DC flexible lead` | 三根线缆，见下文的变形目标 |
| `RearMusicSwitch`、`RearSoundSwitch` | 背面两个滑钮，位置取自 `centerX` |
| `RearTestLamp`、`Connection lens`、`Instrument_RJ45 lamp 0`、`Instrument_RJ45 lamp 1` | 指示灯，运行时各自克隆材质 |
| `Front_roster team plaque A`、`Front_roster team plaque B`、`Front_score enamel bed` | 队牌和计分板，运行时换饰面 |
| `NixieCover_*`、`Nixie_* glass`、`ScoreRegister_glass *`、`Ruby lens 0` … `Ruby lens 3` | 透明罩和词窗底座，运行时调整材质 |

`ReceiverNeedle`、`MeterAmplitude`、`MeterRate` 是旧 VU 表的部件，只在 `instrument-vu.glb` 里。仪表方案的组名是 `Instrument_signal`、`Instrument_tuning`、`Instrument_status`，三者共用一个安装原点，运行时放在 `(5.83, -1.4, 0)`。

### 自定义属性

导出时带上这些属性，运行时读取：

| 对象 | 属性 | 含义 |
| --- | --- | --- |
| `FloppyTransport` | `travel_axis` | 软盘行进方向，当前为 `[0, 0, 1]` |
| `PowerSwitch` | `throw_degrees` | 拨杆行程，当前为 32 |
| `RosterCard_*` | `travel` | 名牌抽出行程，当前为 0.58 |
| `RearMusicSwitch`、`RearSoundSwitch` | `centerX` | 滑钮行程的中心，两端各偏 0.22 |
| `Nixie_Digit_*` | `slot`、`digit`、`cathode_path` | 管位、数字，以及画辉光用的阴极路径 |

### 线缆的变形目标

三根线缆各有一个名为 `unplugged` 的变形目标（morph target）。线缆是固定在机器下方的独立网格，不是插头的子对象；插头拔出时运行时调节变形量，线缆随之弯曲。带变形目标的网格在运行时不参与合并。

### 位置表

`console-surfaces.json` 列出 60 个平面，运行时在这些位置贴上画面或放置点击区域。每项有 `x`、`y`、`z`、`w`、`h`，可选 `rotationX`、`rotationY`（背面的平面转 180 度）、`lit`（受场景灯光照明的印刷面；不带 `lit` 的是自发光的显示面）和 `digitScale`。

把手和背面两处点击区域不在位置表里：把手的位置写在 `web/src/console/view.ts`，坐标要与 `refine_handles.py` 一致；电池仓和灯光自检的位置写在 `engine.ts`。

### 合并与 UV

运行时把静止的不透明网格按材质合并，活动组件内部各自合并，原点不变。合并时只保留 `position`、`normal`、`uv`、`color` 四种顶点属性，所以：

- 贴图依赖的 UV 要在导出时保留，脚本生成的 UV 按材料纹理方向和真实尺寸排布；
- 计分翻牌支架脚下的接触阴影是顶点色，不是阴影贴图；
- 新加的活动部件如果不在 `batchStaticGeometry` 的名单里，会被并入静态网格，无法再单独移动。

### 导出之后

1. 修改 `ConsoleEngine.load()` 里的 `revision` 字符串。模型和位置表的地址共用这个版本号，浏览器和缓存服务器才不会把旧几何和新字样混在一起。
2. 在 `web/` 下运行 `pnpm test`。读取已导出模型的测试在 `scripts/notebook.test.mjs`、`score-flags.test.mjs`、`disk-motion.test.mjs`、`instruments.test.mjs`，它们核对纸带对位、名牌行程、电池和插头结构、八个翻牌转轴、40 个数字、软盘姿态和接收机部件。
3. 用[开发预览](../../docs/console/preview.md)的特写地址目视检查改动的部位。

## 材质和贴图

- **贴图是生成的。** `refine_tactile.py` 生成拉丝铝、拉丝镍、酚醛、棉纸、搪瓷、橡胶六组贴图，`refine_front_layout.py` 生成发报键的红树脂，每组三张 512 px 的颜色、法线、粗糙度贴图。它们存在 `textures/`，并打包进 `.blend` 和 GLB，不依赖 Blender 专有的程序化着色器。
- **`textures/` 里有两组贴图没有进入已发布的模型**：`Score fine brushed nickel`（计分板的拉丝由运行时的 `finishes.ts` 生成）和 `Score pressed glass`（属于被取代的计分灯方案）。
- **中性色共用暖底色。** 所有黑、石墨、炭灰、镍、合金、机壳粉末涂层和背面搪瓷保持各自的明度，色相统一在 OKLCH 约 68–82 度，彩度很低。打包的镍和铝贴图原本偏绿（约 116–135 度），`refine_visual_polish.py` 按基色的变化重新着色，纹理保留。灯、玻璃、显示器件、纸、黄铜、红色部件和主题队伍色不受影响。
- **固定字样是英文几何体。** 机身上的字样（NETWORK、ACTION、ROOM CODE、旋钮和接口标记等）不随游戏状态和界面语言变化，建模为几何体随模型导出。会变的文字由 Three.js 画在贴图上，见[显示器件](../../docs/console/displays.md)。
- **建模用的中文字体**是 macOS 自带的 `STHeiti Medium.ttc`（`refine_tactile.py`），字形导出为几何体，运行时不需要这个字体。

## 背面字样

`remodel_instrument.py` 在背面检修面板写上 `E N C R Y P T O`。当前的 `.blend` 和已发布的 GLB 里仍有旧字样节点 `Instrument_rear wordmark`，运行时载入后把它移除。下次从 `.blend` 导出之前先运行 `remodel_instrument.py`，把字样换掉。

## 参考资料

以下资料用来确定构造和比例，几何和材质都是自己建的，没有复制任何美术资源。

- [Sifam Presentor AL](https://www.sifam.com/meterCategory.asp?cat=Presentor+-+AL)：表头的亚克力前盖、米色表盘和灯箱。
- [APEM 面板指示灯](https://www.apem.com/en-us/led-indicators/professional-grade-panel-mount-led-indicators)：带固定环的漫射灯罩。
- [Epson EU-T300](https://epson.com/For-Work/Printers/POS/EU-T300-Kiosk-Printer-Series/p/C41D383001)：打印机的进纸机构。
- [Tektronix 示波器系统与控制](https://www.tek.com/fr/documents/primer/oscilloscope-systems-and-controls)：示波器旋钮的分组和命名。
- [BlendSwap 辉光管模型（CC0）](https://blendswap.com/blend/10631)：辉光管的构造参考。下载不可用，没有导入任何第三方几何。
