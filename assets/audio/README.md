# 音频制作

这里是终端音效和背景音乐的制作脚本。声音在页面里怎样触发见 [`docs/console/audio.md`](../../docs/console/audio.md)，素材来源与许可见 [`web/public/audio/CREDITS.md`](../../web/public/audio/CREDITS.md)。

| 文件 | 说明 |
| --- | --- |
| `build_bank.py` | 从下载的录音剪出音效库 |
| `build_music.py` | 从一首 CC0 乐曲剪出四段背景音乐 |
| `crt-audition.wav` | 显像管开关机声音的试听文件，由 `build_bank.py` 生成，页面不使用，也不入库 |
| `music-plan.md` | 背景音乐尚未定稿的事项 |

两个脚本只需要 Python 3 标准库和 `ffmpeg`。原始素材不进仓库。

## 音效库

产物：

- `web/public/audio/console-foley-v3.wav`：单声道，24 kHz，16 位 PCM，约 449 KiB，24 种音效、31 个片段；
- `web/src/console/soundBank.ts`：每个片段的起点、时长、音量和最短间隔。这个文件是生成的，不要手工修改。

### 声音的做法

- 按键、拨动开关、软盘和纸带用的是实物录音。按键和旋钮触点各有几段不同的录音轮流使用。
- 走纸声是一段首尾交叠 35 ms 的循环录音，辊轴转动期间持续播放，不按动画帧反复触发。
- 旋钮声取自一串连续触点录音里的单独一格，整串播放会叠成一片杂响。
- 扬声器提示（发报、接收、轮到你、成功、失败、自检）是脚本合成的窄带键控载波，带静噪和触点杂音，没有旋律。
- 显像管的四段声音剪自两段录音：消磁、升温、放电取自同一段消磁线圈的衰减，升温和放电用不同的频带；塌缩取自关机录音。更长的电视开关机录音里有类似人声的背景声，没有使用，也不要再用。

### 重新制作

把下列素材下载到一个临时目录，文件名保持一致：

| 本地文件 | 下载地址 |
| --- | --- |
| `floppy.mp3` | https://cdn.freesound.org/previews/39/39697_276701-hq.mp3 |
| `insert.mp3` | https://cdn.freesound.org/previews/628/628244_890072-hq.mp3 |
| `eject.mp3` | https://cdn.freesound.org/previews/628/628245_890072-hq.mp3 |
| `switch.mp3` | https://cdn.freesound.org/previews/424/424987_8533382-hq.mp3 |
| `printer.mp3` | https://cdn.freesound.org/previews/217/217181_544580-hq.mp3 |
| `tear.mp3` | https://cdn.freesound.org/previews/366/366909_6050874-hq.mp3 |
| `crt-on.mp3` | https://cdn.freesound.org/previews/693/693860_9395330-hq.mp3 |
| `crt-off.mp3` | https://cdn.freesound.org/previews/90/90682_985693-hq.mp3 |
| `keys/Single Keys/keypress-*.wav` | 把 [Keyboard Soundpack](https://opengameart.org/sites/default/files/unicae_games_keyboard_soundpack_1_0.zip) 解压到 `keys/` |
| `interface/Audio/scroll_*.ogg` | 把 [Interface Sounds](https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip) 解压到 `interface/` |

在仓库根目录运行：

```sh
python3 assets/audio/build_bank.py /path/to/source-directory
```

脚本写出四个文件：

- 音效库 WAV 和 `soundBank.ts`；
- 素材目录里的 `console-audition.wav`：按页面里的音量依次播放三次按键、拨动、软盘推入、落座、弹出、走纸、撕纸、发报；
- `assets/audio/crt-audition.wav`：按页面里的音量播放一次冷开机和一次关机。

更换音效库时，同时修改 `build_bank.py` 和 `web/src/console/sound.ts` 里的文件名版本号（`console-foley-v3`）。否则已经缓存了旧文件的浏览器会用新的片段位置去播放旧文件。

## 背景音乐

产物在 `web/public/audio/music/`：四段 MP3（128 kbps，立体声，32 kHz，共约 2.67 MiB）和 `manifest.json`。

四段都剪自 Spring Spring / Julie Damsgaard 的 [(Basically not) Fusion Jazz](https://opengameart.org/content/basically-not-fusion-jazz)（CC0）。原曲是同一个约 82 秒的乐段重复三遍，只有完整混音，没有分轨。

| 文件 | 用途 | 取自原曲 | 处理 | 目标响度 |
| --- | --- | --- | --- | --- |
| `lobby-v1.mp3` | 首页和房间，循环 | 8 秒起，82.129 秒 | 保持原速度、音高和音色 | −23 LUFS |
| `game-v1.mp3` | 对局各阶段，循环 | 下一遍相同乐段 | 高频搁架 −2 dB，轻度压缩 | −27 LUFS |
| `win-v1.mp3` | 己方获胜，播放一次 | 76.2 秒起，6 秒 | 25 ms 起音，1.4 秒收尾 | −22 LUFS |
| `loss-v1.mp3` | 己方落败，播放一次 | 72.5 秒起，4.5 秒 | 高频搁架 −2 dB，同样的起音和收尾 | −25 LUFS |

`game` 比 `lobby` 低约 4 LU，配器相同。变速、均衡和压缩不能减少旋律和鼓的密度；要更稀疏的对局音乐，需要换素材或重新编曲。

### 重新制作

下载原曲 [fusion jazz_0.ogg](https://opengameart.org/sites/default/files/fusion%20jazz_0.ogg)，在仓库根目录运行：

```sh
python3 assets/audio/build_music.py /path/to/fusion.ogg
```

脚本做这些事：

- 循环的接缝用 160 ms 的环形混合：把循环终点之后的延续部分混入开头，边界两侧仍是连续的采样，每次循环不会淡到无声；
- 按目标响度调整增益，同时保证真峰值低于 −2 dBTP；
- 把编码后的 MP3 解码回来，检查时长与预期相差不到 2 ms、循环首尾的采样差小于 0.02；
- 把来源校验值、剪辑点、时长、处理方式和实测响度写入 `manifest.json`。

这些检查能确认响度、削波和循环时序，不能判断音乐是否合适，那要在对局里听。

更换音乐时修改文件名里的版本号（`-v1`），并同步 `web/src/console/music.ts` 的 `musicFiles`。
