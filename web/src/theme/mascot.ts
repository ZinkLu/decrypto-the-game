/**
 * 吉祥物动画配置
 * 使用 ASCII Art 多帧动画实现身体动作
 */

// 动作类型
export type MascotAction =
  | 'idle'
  | 'thinking'
  | 'typing'
  | 'drinkCoffee'
  | 'watchTime'
  | 'sweat'
  | 'celebrate'
  | 'nervous'
  | 'shocked';

// 单帧定义
export interface MascotFrame {
  face: string;      // 表情
  body?: string;     // 身体（可选）
  accessory?: string; // 配件（如咖啡杯、汗滴等）
}

// 动作定义（多帧序列）
export interface MascotAnimation {
  frames: MascotFrame[];
  frameDuration: number; // 每帧持续时间（ms）
  loop: boolean;
}

// 动作库
export const mascotAnimations: Record<MascotAction, MascotAnimation> = {
  idle: {
    frames: [
      { face: '(・_・)', body: '  /|\\  ' },
      { face: '(・_・)', body: '  /|\\  ' },
      { face: '(-_-)', body: '  /|\\  ' }, // 眨眼
      { face: '(・_・)', body: '  /|\\  ' },
    ],
    frameDuration: 800,
    loop: true,
  },

  thinking: {
    frames: [
      { face: '(・_・)', body: ' ∠|\\  ', accessory: '?' },
      { face: '(・o・)', body: ' ∠|\\  ', accessory: '?' },
      { face: '(・_・)', body: ' ∠|\\  ', accessory: '!' },
    ],
    frameDuration: 600,
    loop: true,
  },

  typing: {
    frames: [
      { face: '(•‿•)', body: ' /|█  ' },
      { face: '(•_•)', body: ' /█|  ' },
      { face: '(•‿•)', body: ' █|\\  ' },
      { face: '(•_•)', body: ' /|█  ' },
    ],
    frameDuration: 200,
    loop: true,
  },

  drinkCoffee: {
    frames: [
      { face: '(・_・)', body: '  /|\\  ', accessory: '☕' },
      { face: '(・_・)', body: ' /|   ', accessory: '☕→' },
      { face: '(・‿・)', body: ' /|   ', accessory: ' ☕' },
      { face: '(￣▽￣)', body: ' /|   ', accessory: ' ☕' },
      { face: '(・_・)', body: '  /|\\  ', accessory: '☕' },
    ],
    frameDuration: 500,
    loop: false,
  },

  watchTime: {
    frames: [
      { face: '(・_・)', body: '  /|\\  ' },
      { face: '(・_・)', body: ' /|⌚  ' },
      { face: '(・o・)', body: ' /|⌚  ' },
      { face: '(・_・;)', body: ' /|⌚  ' },
      { face: '(・_・)', body: '  /|\\  ' },
    ],
    frameDuration: 400,
    loop: false,
  },

  sweat: {
    frames: [
      { face: '(・_・;)', body: '  /|\\  ', accessory: '💦' },
      { face: '(・_・;)', body: ' \\|/  ', accessory: '💦' },
      { face: '(°△°;)', body: ' \\|/  ', accessory: '💦💦' },
      { face: '(・_・;)', body: '  /|\\  ', accessory: '💦' },
    ],
    frameDuration: 300,
    loop: true,
  },

  celebrate: {
    frames: [
      { face: '(^▽^)', body: '  /|\\  ' },
      { face: '(^▽^)/', body: ' /|   ', accessory: '🎉' },
      { face: '\\(^▽^)/', body: '  |   ', accessory: '🎉' },
      { face: '(^▽^)/', body: ' /|   ', accessory: '✨' },
      { face: '(^▽^)', body: '  /|\\  ', accessory: '✨' },
    ],
    frameDuration: 250,
    loop: false,
  },

  nervous: {
    frames: [
      { face: '(・_・;)', body: '  /|\\  ' },
      { face: '(・_・;)', body: ' /|\\  ' },
      { face: '(・_・;)', body: '  /|\\ ' },
    ],
    frameDuration: 150,
    loop: true,
  },

  shocked: {
    frames: [
      { face: '(°Д°)', body: ' \\|/  ', accessory: '!!' },
      { face: '(°Д°;)', body: '  |   ', accessory: '!!' },
      { face: '(°Д°)', body: ' /|\\  ', accessory: '!' },
    ],
    frameDuration: 100,
    loop: true,
  },
};

// 状态到动作的映射
export type MascotState = 'waiting' | 'received' | 'almost' | 'ready';

export interface MascotStateConfig {
  primaryAction: MascotAction;
  idleActions?: MascotAction[]; // 闲置时随机播放的动作
  idleChance?: number; // 触发闲置动作的概率
  message: string;
}

export const mascotStateConfig: Record<MascotState, MascotStateConfig> = {
  waiting: {
    primaryAction: 'idle',
    idleActions: ['drinkCoffee', 'watchTime', 'thinking'],
    idleChance: 0.1, // 10% 概率触发
    message: '等待中...',
  },
  received: {
    primaryAction: 'thinking',
    idleActions: ['typing'],
    idleChance: 0.2,
    message: '收到信号...',
  },
  almost: {
    primaryAction: 'nervous',
    message: '快好了...',
  },
  ready: {
    primaryAction: 'celebrate',
    message: '准备就绪!',
  },
};

// 紧张度到动作的覆盖
export const tensionActionOverride: Record<string, MascotAction> = {
  warning: 'watchTime',
  tense: 'sweat',
  critical: 'shocked',
};

// 颜色配置
export const mascotColors = {
  normal: '#00ff88',
  warning: '#88ff00',
  tense: '#ffaa00',
  critical: '#ff4444',
};
