/**
 * Centralized theme color configuration
 * Cold War Intelligence Dossier palette
 * All colors reference CSS variables defined in index.css @theme block
 */

// ============================================================
// Base Colors
// ============================================================

export const colors = {
  // Primary Palette
  navy: 'var(--color-navy)',
  navyLight: 'var(--color-navy-light)',
  navyDark: 'var(--color-navy-dark)',
  cream: 'var(--color-cream)',
  creamDark: 'var(--color-cream-dark)',
  creamLight: 'var(--color-cream-light)',
  intelRed: 'var(--color-intel-red)',
  intelRedDim: 'var(--color-intel-red-dim)',
  brass: 'var(--color-brass)',
  brassDim: 'var(--color-brass-dim)',
  brassLight: 'var(--color-brass-light)',

  // Team Colors
  teamFriendly: 'var(--color-team-friendly)',
  teamFriendlyDim: 'var(--color-team-friendly-dim)',
  teamFriendlyLight: 'var(--color-team-friendly-light)',
  teamEnemy: 'var(--color-team-enemy)',
  teamEnemyDim: 'var(--color-team-enemy-dim)',
  teamEnemyLight: 'var(--color-team-enemy-light)',

  // Background
  bgBase: 'var(--color-bg-base)',
  bgDark: 'var(--color-bg-dark)',
  bgPaper: 'var(--color-bg-paper)',
  bgPaperDark: 'var(--color-bg-paper-dark)',

  // UI
  deskWood: 'var(--color-desk-wood)',
  deskWoodLight: 'var(--color-desk-wood-light)',
  deskWoodDark: 'var(--color-desk-wood-dark)',
  leather: 'var(--color-leather)',
  inkBlack: 'var(--color-ink-black)',
  inkBlue: 'var(--color-ink-blue)',

  // Stamps
  stampRed: 'var(--color-stamp-red)',
  stampBlue: 'var(--color-stamp-blue)',
  stampGreen: 'var(--color-stamp-green)',
  waxRed: 'var(--color-wax-red)',

  // Transition Backgrounds
  transitionFriendlyBg: 'var(--color-transition-friendly-bg)',
  transitionEnemyBg: 'var(--color-transition-enemy-bg)',

  // Status Indicators
  statusConnected: 'var(--color-status-connected)',
  statusDisconnected: 'var(--color-status-disconnected)',
  statusPending: 'var(--color-status-pending)',

} as const;

// ============================================================
// Tension Level Types
// ============================================================

export type TensionLevel = 'normal' | 'warning' | 'tense' | 'critical';

// ============================================================
// Friendly View Tension Config (Teal/Brass/Red)
// ============================================================

export const tensionConfig = {
  normal: {
    bg: 'var(--color-tension-normal-bg)',
    text: 'var(--color-tension-normal-text)',
    progressBar: 'var(--color-tension-normal-text)',
    borderColor: 'var(--color-tension-normal-border)',
  },
  warning: {
    bg: 'var(--color-tension-warning-bg)',
    text: 'var(--color-tension-warning-text)',
    progressBar: 'var(--color-tension-warning-text)',
    borderColor: 'var(--color-tension-warning-border)',
  },
  tense: {
    bg: 'var(--color-tension-tense-bg)',
    text: 'var(--color-tension-tense-text)',
    progressBar: 'var(--color-tension-tense-text)',
    borderColor: 'var(--color-tension-tense-border)',
  },
  critical: {
    bg: 'var(--color-tension-critical-bg)',
    text: 'var(--color-tension-critical-text)',
    progressBar: 'var(--color-tension-critical-text)',
    borderColor: 'var(--color-tension-critical-border)',
  },
} as const;

// ============================================================
// Opponent View Tension Config (Crimson)
// ============================================================

export const opponentTensionConfig = {
  normal: {
    bg: 'var(--color-opponent-normal-bg)',
    text: 'var(--color-opponent-normal-text)',
    progressBar: 'var(--color-opponent-normal-text)',
    borderColor: 'var(--color-opponent-normal-border)',
    mascotColor: 'var(--color-opponent-normal-text)',
  },
  warning: {
    bg: 'var(--color-opponent-warning-bg)',
    text: 'var(--color-opponent-warning-text)',
    progressBar: 'var(--color-opponent-warning-text)',
    borderColor: 'var(--color-opponent-warning-border)',
    mascotColor: 'var(--color-opponent-warning-text)',
  },
  tense: {
    bg: 'var(--color-opponent-tense-bg)',
    text: 'var(--color-opponent-tense-text)',
    progressBar: 'var(--color-opponent-tense-text)',
    borderColor: 'var(--color-opponent-tense-border)',
    mascotColor: 'var(--color-opponent-tense-text)',
  },
  critical: {
    bg: 'var(--color-opponent-critical-bg)',
    text: 'var(--color-opponent-critical-text)',
    progressBar: 'var(--color-opponent-critical-text)',
    borderColor: 'var(--color-opponent-critical-border)',
    mascotColor: 'var(--color-opponent-critical-text)',
  },
} as const;

// ============================================================
// Encryptor Page Tension Config (with emoji/message)
// Intelligence metaphors
// ============================================================

export const encryptorTensionConfig = {
  normal: {
    ...tensionConfig.normal,
    emoji: '🕵️',
    message: '编写情报中...',
    glowIntensity: 1,
  },
  warning: {
    ...tensionConfig.warning,
    emoji: '⏱️',
    message: '窗口期即将关闭...',
    glowIntensity: 1.2,
  },
  tense: {
    ...tensionConfig.tense,
    emoji: '🚨',
    message: '紧急情报！',
    glowIntensity: 1.5,
  },
  critical: {
    ...tensionConfig.critical,
    emoji: '⚠️',
    message: '行动暴露风险！',
    glowIntensity: 2,
  },
} as const;

// ============================================================
// Opponent (A3) Mascot Tension Config
// ============================================================

export const opponentMascotConfig = {
  normal: {
    emoji: '🔍',
    message: '截获通讯中...',
  },
  warning: {
    emoji: '📡',
    message: '信号不稳定...',
  },
  tense: {
    emoji: '🎯',
    message: '即将破译...',
  },
  critical: {
    emoji: '⚠️',
    message: '紧急拦截！',
  },
} as const;

// ============================================================
// Raw Hex Values (for canvas 2D context and computed styles)
// ============================================================

export const rawColors = {
  // Primary Palette
  navy: '#0B1426',
  navyLight: '#142038',
  navyDark: '#060A14',
  cream: '#E8DCC8',
  creamDark: '#D4C4A8',
  creamLight: '#F2EBE0',
  intelRed: '#C41E3A',
  intelRedDim: '#7A1225',
  brass: '#B8860B',
  brassDim: '#8B6508',
  brassLight: '#DAA520',

  // Team Colors
  teamFriendly: '#0E7C6B',
  teamFriendlyDim: '#0A5A4D',
  teamFriendlyLight: '#12A68E',
  teamEnemy: '#8B0000',
  teamEnemyDim: '#5C0000',
  teamEnemyLight: '#B22222',

  // Background
  bgBase: '#0B1426',
  bgDark: '#060A14',
  bgPaper: '#E8DCC8',
  bgPaperDark: '#D4C4A8',

  // UI
  deskWood: '#3E2723',
  deskWoodLight: '#5D4037',
  deskWoodDark: '#2C1A12',
  leather: '#4A3728',
  inkBlack: '#1A1A1A',
  inkBlue: '#1B3A5C',

  // Stamps
  stampRed: '#C41E3A',
  stampBlue: '#1B3A5C',
  stampGreen: '#0E7C6B',
  waxRed: '#8B0000',

  // Tension friendly
  tensionNormalBg: '#0B1E2E',
  tensionNormalText: '#0E7C6B',
  tensionWarningBg: '#1A1A0A',
  tensionWarningText: '#B8860B',
  tensionTenseBg: '#2A0A0A',
  tensionTenseText: '#C41E3A',
  tensionCriticalBg: '#3A0808',
  tensionCriticalText: '#FF2D2D',

  // Tension opponent
  opponentNormalBg: '#1A0808',
  opponentNormalBorder: '#5C0000',
  opponentWarningBg: '#220A0A',
  opponentTenseBg: '#2F0A0A',
  opponentCriticalBg: '#3A0808',
  opponentScreenBg: '#1A0808',
  opponentCrtScreen: '#0f0505',

  // Status
  statusConnected: '#0E7C6B',
  statusDisconnected: '#C41E3A',
  statusPending: '#B8860B',

} as const;

// ============================================================
// Transition Overlay Config
// ============================================================

export type TransitionRole =
  | 'encryptor' | 'teammate' | 'opponent'
  | 'alert' | 'intercepting' | 'secure' | 'passed';

export const transitionConfig: Record<TransitionRole, { text: string; color: string; bgColor: string; rotation: number }> = {
  // A2B transitions
  encryptor: {
    text: '情报已发送',
    color: '#0E7C6B',
    bgColor: '#0B1E2E',
    rotation: -3,
  },
  teammate: {
    text: '准备解码',
    color: '#0E7C6B',
    bgColor: '#0B1E2E',
    rotation: -3,
  },
  opponent: {
    text: '通讯已截获',
    color: '#8B0000',
    bgColor: '#1A0808',
    rotation: 3,
  },
  // B2C transitions — Branch A: opponent intercepts
  alert: {
    text: '⚠️ 通讯被截获！',
    color: '#8B0000',
    bgColor: '#1A0808',
    rotation: 3,
  },
  intercepting: {
    text: '发起拦截行动',
    color: '#8B0000',
    bgColor: '#1A0808',
    rotation: 3,
  },
  // B2C transitions — Branch B: opponent skips
  secure: {
    text: '通讯安全，未被拦截',
    color: '#0E7C6B',
    bgColor: '#0B1E2E',
    rotation: -3,
  },
  passed: {
    text: '放弃拦截',
    color: '#5C0000',
    bgColor: '#1A0808',
    rotation: 3,
  },
} as const;

// ============================================================
// Alert Tension Config (C1 - being intercepted)
// Mixed color: friendly base invaded by red
// ============================================================

export const alertTensionConfig = {
  normal: {
    bg: '#1A0E14',
    text: rawColors.intelRed,
    borderColor: rawColors.intelRed,
    emoji: '😰',
    message: '通讯暴露中…',
    scanSpeed: 2,
  },
  warning: {
    bg: '#250A12',
    text: rawColors.intelRed,
    borderColor: rawColors.intelRed,
    emoji: '😓',
    message: '他们在分析…',
    scanSpeed: 1.5,
  },
  tense: {
    bg: '#2A0A0A',
    text: rawColors.teamEnemy,
    borderColor: rawColors.teamEnemy,
    emoji: '😤',
    message: '坚持住！',
    scanSpeed: 1,
  },
  critical: {
    bg: '#3A0808',
    text: rawColors.tensionCriticalText,
    borderColor: rawColors.tensionCriticalText,
    emoji: '🚨',
    message: '紧急状态！',
    scanSpeed: 0.6,
  },
} as const;
