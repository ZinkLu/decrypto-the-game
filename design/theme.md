# Decrypto 视觉主题规范

> 源文件: `web/src/index.css`（CSS 变量 + 全局样式）、`web/src/theme/colors.ts`（TypeScript 引用）
>
> 整体风格: **冷战情报档案 (Cold War Intelligence Dossier)**
> 技术栈: Tailwind CSS v4 `@theme` + CSS Variables + Framer Motion + inline styles

---

## 1. 色彩系统

### 1.1 基础色板

| Token | 色值 | 用途 |
|-------|------|------|
| `navy` | `#0B1426` | 主背景色 |
| `navy-light` | `#142038` | 次级背景、面板底色 |
| `navy-dark` | `#060A14` | 深层背景、渐变终点 |
| `cream` | `#E8DCC8` | 纸张色、主要文字（暗底上） |
| `cream-dark` | `#D4C4A8` | 旧纸色、次级纸张 |
| `cream-light` | `#F2EBE0` | 高亮纸张 |
| `intel-red` | `#C41E3A` | 情报红、图章墨色、紧急标记 |
| `intel-red-dim` | `#7A1225` | 暗红、次级警告 |
| `brass` | `#B8860B` | 铜制元素、按钮、装饰 |
| `brass-dim` | `#8B6508` | 暗铜 |
| `brass-light` | `#DAA520` | 亮铜、高光 |

### 1.2 队伍色

| Token | 色值 | 用途 |
|-------|------|------|
| `team-friendly` | `#0E7C6B` | 己方主色（青绿） |
| `team-friendly-dim` | `#0A5A4D` | 己方暗色 |
| `team-friendly-light` | `#12A68E` | 己方亮色 |
| `team-enemy` | `#8B0000` | 敌方主色（深红） |
| `team-enemy-dim` | `#5C0000` | 敌方暗色 |
| `team-enemy-light` | `#B22222` | 敌方亮色 |

### 1.3 UI 材质色

| Token | 色值 | 用途 |
|-------|------|------|
| `desk-wood` | `#3E2723` | 桌面底色 |
| `desk-wood-light` | `#5D4037` | 桌面亮部 |
| `desk-wood-dark` | `#2C1A12` | 桌面暗部 |
| `leather` | `#4A3728` | 皮革质感 |
| `ink-black` | `#1A1A1A` | 墨水黑、纸上文字 |
| `ink-blue` | `#1B3A5C` | 蓝色墨水图章 |

### 1.4 图章与蜡封色

| Token | 色值 | 用途 |
|-------|------|------|
| `stamp-red` | `#C41E3A` | 红色图章 |
| `stamp-blue` | `#1B3A5C` | 蓝色图章 |
| `stamp-green` | `#0E7C6B` | 绿色图章 |
| `wax-red` | `#8B0000` | 蜡封红 |

### 1.5 状态指示色

| Token | 色值 | 用途 |
|-------|------|------|
| `status-connected` | `#0E7C6B` | 已连接 |
| `status-disconnected` | `#C41E3A` | 已断开 |
| `status-pending` | `#B8860B` | 等待中 |

### 1.6 过渡背景色

| Token | 色值 |
|-------|------|
| `transition-friendly-bg` | `#0B1E2E` |
| `transition-enemy-bg` | `#1A0808` |

---

## 2. 张力系统 (Tension System)

游戏中倒计时推进时，界面整体氛围通过 4 级张力状态递进变化。

### 2.1 己方视角 (Friendly View)

配色从青绿 → 铜色 → 红色递进：

| 等级 | 背景 | 文字/进度条 | 边框 |
|------|------|------------|------|
| `normal` | `#0B1E2E` | `#0E7C6B` | `#0A5A4D` |
| `warning` | `#1A1A0A` | `#B8860B` | `#8B6508` |
| `tense` | `#2A0A0A` | `#C41E3A` | `#7A1225` |
| `critical` | `#3A0808` | `#FF2D2D` | `#B22222` |

### 2.2 敌方视角 (Opponent View)

全程使用深红色系递进：

| 等级 | 背景 | 文字 | 边框 |
|------|------|------|------|
| `normal` | `#1A0808` | `#8B0000` | `#5C0000` |
| `warning` | `#220A0A` | `#A52A2A` | `#6E1B1B` |
| `tense` | `#2F0A0A` | `#C41E3A` | `#7A1225` |
| `critical` | `#3A0808` | `#FF2D2D` | `#B22222` |

### 2.3 被拦截视角 (Alert View)

己方底色中混入红色，表示己方安全被侵入：

| 等级 | 背景 | 文字 | 扫描速度 |
|------|------|------|---------|
| `normal` | `#1A0E14` | `#C41E3A` | 2s |
| `warning` | `#250A12` | `#C41E3A` | 1.5s |
| `tense` | `#2A0A0A` | `#8B0000` | 1s |
| `critical` | `#3A0808` | `#FF2D2D` | 0.6s |

### 2.4 张力等级对应的吉祥物消息

**加密者 (Encryptor):**

| 等级 | Emoji | 消息 |
|------|-------|------|
| normal | 🕵️ | 编写情报中... |
| warning | ⏱️ | 窗口期即将关闭... |
| tense | 🚨 | 紧急情报！ |
| critical | ⚠️ | 行动暴露风险！ |

**对手窃听 (Opponent Mascot):**

| 等级 | Emoji | 消息 |
|------|-------|------|
| normal | 🔍 | 截获通讯中... |
| warning | 📡 | 信号不稳定... |
| tense | 🎯 | 即将破译... |
| critical | ⚠️ | 紧急拦截！ |

**被拦截 (Alert):**

| 等级 | Emoji | 消息 |
|------|-------|------|
| normal | 😰 | 通讯暴露中… |
| warning | 😓 | 他们在分析… |
| tense | 😤 | 坚持住！ |
| critical | 🚨 | 紧急状态！ |

---

## 3. 字体系统

通过 Google Fonts 加载 4 个字体家族：

```
Special Elite | Courier Prime (400/700/italic) | Bebas Neue | Noto Serif SC (400/700)
```

| CSS 变量 | 字体 | 回退 | 用途 |
|----------|------|------|------|
| `--font-typewriter` | Special Elite | Courier New, cursive | 打字机风格标题、情感文字、副标题 |
| `--font-body` | Courier Prime | Courier New, monospace | 正文文字、数据展示、默认字体 |
| `--font-stamp` | Bebas Neue | Impact, sans-serif | 图章文字、大号标签、编号 |
| `--font-chinese` | Noto Serif SC | SimSun, serif | 中文内容 |

---

## 4. 动画系统

### 4.1 主题动画 (CSS @keyframes)

定义在 `@theme` 块中，通过 `--animate-*` CSS 变量引用：

| 动画名 | 时长 | 缓动 | 效果 |
|--------|------|------|------|
| `stamp-press` | 0.3s | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 图章盖下：从 1.5x 缩放 + 旋转弹到 1x |
| `typewriter-key` | 0.1s | ease-out | 打字机按键：向上偏移 → 回位 |
| `paper-curl` | 0.5s | ease-in-out | 纸张卷曲：X 轴旋转 10° → -2° → 0 |
| `desk-lamp-flicker` | 4s | ease-in-out, infinite | 台灯闪烁：92-96% 处亮度微跳 |
| `urgent-stamp` | 0.5s | ease-out | 紧急图章：从 2x 缩放 + 旋转 -10° 落下 |
| `paper-shuffle` | 0.3s | ease-in-out | 纸张抖动：左右 ±3px + 旋转 ±1° |
| `wax-seal-press` | 0.4s | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 蜡封按压：从 1.3x 弹到 1x |

### 4.2 对手/警报页面动画

全局 CSS `@keyframes`：

| 动画名 | 效果 |
|--------|------|
| `pulse-red` | 透明度脉冲：0 → 1 → 0 |
| `breathe-red` | 红色呼吸光晕：box-shadow 10px ↔ 25px |
| `flash-red` | 透明度闪烁：0.7 ↔ 1 |
| `phone-ring` | 电话振动：旋转 ±5° → ±3° |
| `scan-line` | 扫描线：从 top 0% 到 100%，两端淡出 |
| `card-flash` | 卡片闪烁：边框色和光晕在默认色与 intel-red 间切换 |

### 4.3 通用动画

| 动画名 | 效果 |
|--------|------|
| `blink` | 光标闪烁：0-50% 显示，51-100% 隐藏，0.8s 循环 |

---

## 5. 全局 CSS 类

### 5.1 纸张质感

| 类名 | 效果 |
|------|------|
| `.paper-texture` | 浅色纸张底色 (`bg-paper`) + SVG 分形噪声 (opacity 0.05) + 墨水黑文字 |
| `.paper-texture-dark` | 深色纸张底色 (`bg-paper-dark`) + SVG 分形噪声 (opacity 0.06) + 墨水黑文字 |

### 5.2 打字机文字

| 类名 | 效果 |
|------|------|
| `.typewriter-text` | Special Elite 字体 + 墨水黑 + 文字阴影 (0.3 opacity) + 字间距 0.5px |
| `.typewriter-text-light` | Special Elite 字体 + 奶油色 + 文字阴影 (0.5 opacity) + 字间距 0.5px |

### 5.3 图章效果

| 类名 | 效果 |
|------|------|
| `.stamp-text` | Bebas Neue 字体 + 全大写 + 字间距 4px + 透明度 0.85 |
| `.stamp-red` | 情报红色文字 + 3px 边框 + 内边距 + 旋转 -3° |
| `.stamp-blue` | 墨蓝色文字 + 3px 边框 + 内边距 + 旋转 +2° |

### 5.4 桌面与灯光

| 类名 | 效果 |
|------|------|
| `.desk-surface` | 木桌渐变 (desk-wood → desk-wood-dark) + 内阴影 |
| `.desk-lamp-spotlight` | 固定定位椭圆放射渐变 (暖黄 8% opacity) + 台灯闪烁动画 |

### 5.5 全局覆盖层

| 类名 | z-index | 效果 |
|------|---------|------|
| `.paper-grain` | 9998 | 固定定位 + SVG 分形噪声 (opacity 0.03)，模拟纸张颗粒 |
| `.vignette` | 9997 | 固定定位 + 放射渐变暗角 (中心透明，边缘 50% 黑) |

### 5.6 铜制元素

| 类名 | 效果 |
|------|------|
| `.brass-accent` | 三段线性渐变 (brass-light → brass → brass-dim) + 内外阴影模拟金属光泽 |
| `.brass-text` | 铜色文字 + 下方阴影 |

### 5.7 装饰效果

| 类名 | 效果 |
|------|------|
| `.coffee-stain` | 伪元素圆形放射渐变 (棕色 8% opacity)，右上角咖啡渍 |
| `.torn-edge-top` | 伪元素 SVG 锯齿路径，模拟撕纸边缘 |
| `.redacted` | 墨水黑底色 + 透明文字，模拟涂黑/遮蔽效果 |

### 5.8 光标

| 类名 | 效果 |
|------|------|
| `.typewriter-cursor` | 2px 宽墨水黑竖线 + blink 动画 0.8s |
| `.typewriter-cursor-light` | 2px 宽奶油色竖线 + blink 动画 0.8s |
| `.blink` | blink 动画 1s |

---

## 6. 组件库

组件位于 `web/src/components/dossier/`。

### 6.1 PaperCard

纸质卡片容器，模拟老旧档案纸。

- 变体: `default` | `index`（蓝色横线）| `note`（黄色便签 #FFFACD）
- 可选装饰: 咖啡渍 (`showCoffeeStain`)、回形针 (`showPaperClip`)、折痕 (`showFoldMark`)
- 底色: 奶油纸 + SVG 噪声纹理
- 文字: 墨水黑

### 6.2 RubberStamp

橡皮图章效果。

- 颜色: `red` | `blue` | `green`
- 尺寸: `small` | `medium` | `large`（按比例缩放）
- 旋转角度: 可自定义（默认 -3°）
- 字体: Bebas Neue + 全大写 + 宽字间距
- 边框: 与文字同色
- SVG 分形噪声滤镜模拟粗糙边缘
- 可选 `stamp-press` 入场动画

### 6.3 TypewriterText

打字机风格文字。

- 字体: Special Elite
- 尺寸: `small` | `medium` | `large`
- 颜色: `dark` | `light` | `teal` | `red` | `brass` | 自定义 hex
- 可渲染为: span, div, h1-h3, p
- 文字阴影 + 字间距 0.5px

### 6.4 TypewriterInput

打字机风格输入框。

- 字体: Special Elite
- 底部边框（聚焦时变色: brass 或队伍色）
- 聚焦时闪烁光标
- 色彩模式: `dark` | `light`
- 字符计数指示器（达到上限时变红）

### 6.5 DossierButton

主题按钮（Framer Motion 驱动）。

- 变体: `primary`（铜色渐变）| `secondary`（奶油底+边框）| `danger`（深红渐变）| `stamp`（透明+边框）
- 尺寸: `small` | `medium` | `large`
- 交互: hover scale 1.02 + y -1px, tap scale 0.98 + y +2px
- 禁用: 50% opacity + not-allowed 光标

### 6.6 BrassTokenPad

铜制数字选择面板（用于 1-4 密码输入）。

- 按钮: 放射渐变铜色
- 尺寸: `small` | `medium` | `large`
- 选中状态: 弹簧物理动画标记
- 禁用状态: 降低透明度
- 张力感知: 按钮颜色随张力等级变化
  - normal → brass
  - warning → brass-light
  - tense → intel-red
  - critical → `#FF2D2D`

### 6.7 DeskClockTimer

圆形进度倒计时器（SVG 绘制）。

- SVG 圆弧进度条
- 铜色表框边框
- 时间数字: Special Elite 字体
- 下方进度条
- 主题: `friendly` | `opponent` | `alert`
- 颜色随张力等级变化（对应各主题的张力配置）
- 尺寸: `small` | `medium` | `large`

### 6.8 RedactedText

模拟涂黑/乱码文字。

- 字体: Courier Prime
- 墨水黑底色 + 透明文字
- 可选毛刺动画: 随机替换字符为 `█▓▒░▮▯▰▱`
- 毛刺速度: 可配置 (ms)

### 6.9 ManilaFolder

马尼拉纸文件夹容器。

- 顶部标签: 文件夹色 (#C4A66A) + Bebas Neue 标签文字
- 主体: 马尼拉棕渐变
- 内部: 奶油纸质感
- 多层阴影模拟立体感

### 6.10 WaxSeal

装饰性蜡封元素。

- 圆形放射渐变（红色蜡）
- 中心浮雕 "D" 字母
- 尺寸: `small` (32px) | `medium` (48px) | `large` (64px)
- 文字阴影模拟浮雕效果

### 6.11 DossierEffectLayer

全局氛围覆盖层。

- 包含: 台灯光斑 + 纸张颗粒 + 暗角
- 全部固定定位 + pointer-events: none
- 在页面最外层渲染

### 6.12 AgentPanel

特工吉祥物面板。

- 底色: navy-light
- 边框: 队伍色
- 文字: Special Elite
- 主题: `friendly` | `enemy` | `alert`
- 支持 aria-live 无障碍实时更新

### 6.13 DossierTransition / TransitionOverlay

全屏过渡覆盖层。

- 全屏背景色（按角色配置）
- 中央大号 Bebas Neue 图章文字 (3rem)
- 图章旋转 ±3°
- `stamp-press` 入场动画
- 微弱放射渐变墨迹背景
- Special Elite 副标题文字

过渡配置（`transitionConfig`）:

| 角色键 | 文字 | 颜色 | 背景 | 旋转 |
|--------|------|------|------|------|
| `encryptor` | 情报已发送 | `#0E7C6B` | `#0B1E2E` | -3° |
| `teammate` | 准备解码 | `#0E7C6B` | `#0B1E2E` | -3° |
| `opponent` | 通讯已截获 | `#8B0000` | `#1A0808` | +3° |
| `alert` | 通讯被截获！ | `#8B0000` | `#1A0808` | +3° |
| `intercepting` | 发起拦截行动 | `#8B0000` | `#1A0808` | +3° |
| `secure` | 通讯安全，未被拦截 | `#0E7C6B` | `#0B1E2E` | -3° |
| `passed` | 放弃拦截 | `#5C0000` | `#1A0808` | +3° |

---

## 7. 无障碍与响应式

### 7.1 键盘焦点

```css
:focus-visible {
  outline: 2px solid var(--color-brass);
  outline-offset: 2px;
}
```

### 7.2 减弱动画

```css
@media (prefers-reduced-motion: reduce) {
  /* 所有动画时长设为 0.01ms */
  /* 光标闪烁关闭，固定 opacity: 1 */
  /* 台灯闪烁关闭 */
}
```

### 7.3 触控优化

所有可交互元素:
- `touch-action: manipulation`（禁止双击缩放）
- `-webkit-tap-highlight-color: transparent`（去除触摸高亮）

### 7.4 全局布局

```css
html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
body {
  background-color: var(--color-bg-base);  /* #0B1426 */
  font-family: var(--font-body);           /* Courier Prime */
  color: var(--color-cream);               /* #E8DCC8 */
  color-scheme: dark;
}
```
