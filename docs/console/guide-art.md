# 教程插图

玩法教程里的三个人物来自同一张图：

- 文件：`web/public/images/guide/agents.png`
- 尺寸：2172 × 724，透明背景 PNG
- 内容：横向三格、每格正方形，从左到右依次是**加密者**（一手掩口低语，一手拿着空白小卡片）、**队友**（举拳）、**对手**（戴礼帽的侦探，拿放大镜和空白笔记本）

图上没有任何文字、数字、箭头或背景。标签、密码标注和示例回合都由程序另外绘制，所以同一张图可以用于中英文，强调色也能跟随当前主题。

相关文档：[显示器件 · 分页教程](displays.md#分页教程) · [主题色](themes.md)

## 怎样使用

路径定义在 `web/src/console/guide.ts` 的 `guideArtUrl`，教程的文字内容（四个步骤、示例密词、示例线索、三轮历史记录）也在这个文件里，主屏、手机布局和无障碍文本共用。

**主屏教程**（`paint.ts` 的 `paintGuide`）。`Console.tsx` 载入图片后交给 `paint()`，每个人物按三分之一宽度从图上裁出：

| 页 | 内容 | 人物 |
|---|---|---|
| 1 看我方密词 | 我方四个词窗、对方被遮住的词窗，以及每回合的三个角色 | 三人并排：加密者、队友、对手 |
| 2 按密码给线索 | 密码 → 密词 → 线索，由私密到公开 | 加密者 |
| 3 对手先猜 | 前几轮的线索与揭晓的密码，对手据此猜测 | 对手 |
| 4 队友后猜 | 线索 → 我方密词 → 编号，以及胜负条件 | 队友 |

己方的角色和标注用主题的己方色，对手用对方色，猜错的示例用警告色。

**手机布局**（`GuideContent.tsx`）。同一张图作为背景图，以 `background-size: 300% 100%` 配合左、中、右三个位置取出三个人物，内容与主屏的四步相同，排成一列。

**无障碍文本。** 桌面布局打开教程时，`GuideContent` 以 `transcript` 模式输出一份不含插图的文字稿，供读屏软件使用。

教程里标在线索上的密码编号只用于讲解对应关系。对局中对手的线索上永远不会出现这样的标注。

## 图片的生成提示词

插图由图像生成工具制作：先确定单页教程的画面，再把其中三个人物提取为一张无文字的透明图。最终使用的提示词如下，重新生成时保持不变，以保留人物设计。

```text
Use case: background-extraction / identity-preserve.
Asset: a production transparent sprite sheet for the Encrypto game tutorial.
Input image 1 is the approved edit target. Extract its THREE original cartoon people into one horizontal strip of three equal square cells: LEFT the cheerful encryptor whispering with a blank small card in other hand; CENTER cheerful teammate with raised fist, without any rack; RIGHT fedora detective with magnifier and a completely blank notebook. Keep exactly their approved faces, clothing, poses and 1950s educational cartoon style, warm ivory fills and very dark petrol ink outlines. Each entire upper-body bust centered in its own third with generous transparent padding; nothing crosses cell boundaries. Remove ALL lettering, numbers, word racks, arrows, speech bubbles, symbols, titles and background. Card and notebook completely blank. Actual transparent alpha background, no checkerboard. Clean screen printing with strong linework and no grain. Wide 3:1 sheet, three equally sized busts. Preserve the character designs; this is the same approved illustration, separated for a localized UI.
```

## 原版桌游的链接

机身左上角的 ORIGINAL GAME 键打开原作介绍页，教程最后一页也有 BGG 的链接。三个链接定义在 `guide.ts` 的 `originalGameLinks`：

- 官方网站：https://www.scorpionmasque.com/en/decrypto
- BGG 游戏介绍：https://boardgamegeek.com/boardgame/225694/decrypto
- 购买原版桌游：https://shop.scorpionmasque.com/products/decrypto

介绍文字是对发行商说明的转述。界面上写明这是非官方的玩家作品，与原作方没有关联。
