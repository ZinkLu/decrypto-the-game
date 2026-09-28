# 文档

## 玩

| 文档 | 内容 |
| --- | --- |
| [玩法](gameplay.md) | 规则、一个回合怎么进行、机器上每个部件是做什么的 |

## 运行

| 文档 | 内容 |
| --- | --- |
| [构建与运行](getting-started.md) | 构建、环境变量、AI 队员的配置、开发与测试 |
| [部署](deployment.md) | 用 Docker 放到服务器上，房间数据保存在哪里、保存多久 |

## Console

界面是一台建模出来的密码通信机，代码在 `web/`。

| 文档 | 内容 |
| --- | --- |
| [设计总览](console/README.md) | 为什么是一台机器，设计原则，部件一览 |
| [代码组织](console/code.md) | 目录、数据流、测试，以及怎样往里加东西 |
| [显示器件](console/displays.md) | 主屏、词窗、示波器、辉光管、时钟和仪表 |
| [机械与交互](console/mechanics.md) | 开关、把手、软盘、名牌、翻牌、纸带和手机布局 |
| [背面联动](console/rear-linkage.md) | 供电、网线、AUX 与正面的关系 |
| [声音](console/audio.md) | 音效与背景音乐 |
| [主题色](console/themes.md) | 四套配色 |
| [画质与性能](console/quality.md) | 画质档位与实测开销 |
| [开发预览](console/preview.md) | 不连服务器查看任意状态的 URL 参数 |
| [教程插图](console/guide-art.md) | 玩法图解的插图 |

制作素材的说明放在素材旁边：

| 文档 | 内容 |
| --- | --- |
| [建模流水线](../assets/console/README.md) | Blender 源文件、各道工序脚本、与运行时的约定 |
| [音频制作](../assets/audio/README.md) | 音效库与背景音乐的制作 |
| [音效与音乐的来源](../web/public/audio/CREDITS.md) | 第三方录音与音乐的作者和许可 |
| [字体的来源](../web/public/fonts/README.md) | 软盘标签字体的作者和许可 |

## 后端

服务端是一个 Go 程序，代码在 `cmd/` 和 `internal/`。

| 文档 | 内容 |
| --- | --- |
| [后端架构](architecture.md) | 包的划分、回合状态机、桥接层、房间、持久化、AI 队员、接入其他入口 |
| [WebSocket 协议](protocol.md) | 页面与服务端之间的全部消息 |

## 记录

[`e2e/`](e2e/README.md) 里是两次端到端测试的报告和当时的截图，按日期存放，不随代码更新。
