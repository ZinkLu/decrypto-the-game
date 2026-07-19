# 前端页面与组件索引

> 路由总表见 `src/App.tsx`（按 `phase × role` 分发页面）。
> 一个回合分四个阶段：**ENCRYPTING → INTERCEPT → DECRYPT → ROUND_RESULT**。
> 每个阶段每种角色（encryptor / teammate / opponent）看到的页面不同。

## 一、大厅阶段（回合外）

| phase  | 页面      | 用途                          |
| ------ | --------- | ----------------------------- |
| `home` | Home.tsx  | 首页 / 创建房间               |
| `room` | Room.tsx  | 房间大厅（等人、分队、加 AI） |

---

## 二、回合内阶段

### 阶段 1 ── ENCRYPTING（加密者出题）

> 加密者看 3 个秘密数字，给己方写 3 条线索。

| 角色      | 页面                  | 状态                                     |
| --------- | --------------------- | ---------------------------------------- |
| encryptor | Encryptor.tsx         | 出题主界面：看数字、写线索、提交         |
| teammate  | TeammateWaiting.tsx   | 等待己方加密者出题                       |
| opponent  | OpponentWaiting.tsx   | 等待对方加密者出题                       |

### 阶段 2 ── INTERCEPT（对手拦截，第 3 回合起）

> 对手看到己方线索，尝试猜出对方的数字顺序。

| 角色      | 页面                      | 状态                                     |
| --------- | ------------------------- | ---------------------------------------- |
| encryptor | InterceptedWaiting.tsx    | 己方出完题，等对手拦截                   |
| teammate  | InterceptedWaiting.tsx    | 己方出完题，等对手拦截（共用同一页面）   |
| opponent  | OpponentIntercepting.tsx  | 拦截主界面：看对方线索、下注数字顺序     |

### 阶段 3 ── DECRYPT（队友解密）

> 己方队友（非加密者）根据线索猜己方数字顺序。

| 角色      | 页面                   | 状态                                     |
| --------- | ---------------------- | ---------------------------------------- |
| encryptor | EncryptorWatching.tsx  | 看队友解密（示波器/辉光管实时反馈）      |
| teammate  | TeammateDecoding.tsx   | 解密主界面：看线索、选数字、提交         |
| opponent  | OpponentAnalyzing.tsx  | 拦截已提交，等对手队伍解密结果            |

### 阶段 4 ── ROUND_RESULT（回合结算）

| 角色 | 页面              | 状态                 |
| ---- | ----------------- | -------------------- |
| 所有 | RoundResult.tsx   | 展示本回合拦截/失误  |

---

## 三、终局

| phase       | 页面           | 用途     |
| ----------- | -------------- | -------- |
| `game_over` | GameOver.tsx   | 游戏结束 |

---

## 四、核心组件（src/components/）

| 组件                  | 用途         |
| --------------------- | ------------ |
| TransitionOverlay.tsx | 全局转场遮罩 |

### dossier 系列（复古档案 / 谍报风格 UI）

| 组件                       | 用途                                        |
| -------------------------- | ------------------------------------------- |
| AgentPanel.tsx             | 底部特工 emoji + 气泡文案                   |
| BrassTokenPad.tsx          | 黄铜数字按键盘（1–4）                       |
| DeskClockTimer.tsx         | 桌面时钟计时器                              |
| DossierButton.tsx          | 档案风格按钮（含 stamp 变体）               |
| DossierEffectLayer.tsx     | 整页胶片噪点 / 漏光 / 暗角特效层            |
| DossierTransition.tsx      | 档案风格页面转场                            |
| ManilaFolder.tsx           | 牛皮纸文件夹卡片                            |
| PaperCard.tsx              | 纸张卡片（可带回形针）                      |
| RedactedText.tsx           | 涂黑 / 打码文字                             |
| SelectorOscilloscope.tsx   | 示波器 + 辉光管数字（DECRYPT 阶段实时反馈） |
