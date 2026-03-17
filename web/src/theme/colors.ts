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

  // Legacy aliases for old components
  crtPhosphor: 'var(--color-team-friendly)',
  crtPhosphorDim: 'var(--color-team-friendly-dim)',
  crtAmber: 'var(--color-brass)',
  crtAmberDim: 'var(--color-brass-dim)',
  crtScreen: 'var(--color-bg-dark)',
  crtScreenLight: 'var(--color-navy-light)',
  bgDarkBlue: 'var(--color-bg-base)',
  metal: 'var(--color-leather)',
  metalLight: 'var(--color-desk-wood-light)',
  metalDark: 'var(--color-desk-wood-dark)',
  panel: 'var(--color-desk-wood)',
  waveActive: 'var(--color-team-friendly)',
  waveCompleted: 'var(--color-team-friendly-dim)',
  waveWaiting: 'var(--color-navy-light)',
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

  // Legacy aliases for old components (CRTButton, NumberPad, CountdownTimer, etc.)
  crtPhosphor: '#0E7C6B',
  crtPhosphorDim: '#0A5A4D',
  crtAmber: '#B8860B',
  crtAmberDim: '#8B6508',
  crtScreen: '#060A14',
  crtScreenLight: '#142038',
  metal: '#4A3728',
  metalLight: '#5D4037',
  metalDark: '#2C1A12',
  panel: '#3E2723',
  bgDarkBlue: '#0B1426',
  deviceFrame: '#2C1A12',
  deviceFrameLight: '#3E2723',
  deviceFrameDark: '#1A1A1A',
  deviceLabelBg: '#0B1426',
  deviceLabelBorder: '#142038',
  deviceScrew: '#5D4037',
  deviceScrewSlot: '#2C1A12',
} as const;

// ============================================================
// Legacy exports for old components
// ============================================================

export const deviceColors = {
  frame: 'var(--color-desk-wood-dark)',
  frameLight: 'var(--color-desk-wood)',
  frameDark: 'var(--color-navy-dark)',
  labelBg: 'var(--color-bg-base)',
  labelBorder: 'var(--color-navy-light)',
  screw: 'var(--color-desk-wood-light)',
  screwSlot: 'var(--color-desk-wood-dark)',
} as const;

export const screenEffectColors = {
  reflection: 'rgba(255, 255, 255, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.9)',
  vignette: 'rgba(0, 0, 0, 0.4)',
  scanline: 'rgba(0, 0, 0, 0.15)',
} as const;

export const waveConfig = {
  active: { color: '#0E7C6B', borderColor: '#0E7C6B', amplitude: 25, frequency: 0.05, speed: 1.5, glowIntensity: 10 },
  completed: { color: '#0A5A4D', borderColor: '#0A5A4D', amplitude: 8, frequency: 0.02, speed: 0.3, glowIntensity: 3 },
  waiting: { color: '#142038', borderColor: '#142038', amplitude: 2, frequency: 0, speed: 0, glowIntensity: 0 },
} as const;

export type WaveState = keyof typeof waveConfig;

// ============================================================
// Transition Overlay Config
// ============================================================

export type TransitionRole = 'encryptor' | 'teammate' | 'opponent';

export const transitionConfig: Record<TransitionRole, { text: string; color: string; bgColor: string }> = {
  encryptor: {
    text: '情报已发送',
    color: '#0E7C6B',
    bgColor: '#0B1E2E',
  },
  teammate: {
    text: '准备解码',
    color: '#0E7C6B',
    bgColor: '#0B1E2E',
  },
  opponent: {
    text: '通讯已截获',
    color: '#8B0000',
    bgColor: '#1A0808',
  },
} as const;
