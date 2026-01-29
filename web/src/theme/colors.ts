/**
 * Centralized theme color configuration
 * All colors reference CSS variables defined in index.css @theme block
 */

// ============================================================
// Base Colors
// ============================================================

export const colors = {
  // CRT Display
  crtPhosphor: 'var(--color-crt-phosphor)',
  crtPhosphorDim: 'var(--color-crt-phosphor-dim)',
  crtAmber: 'var(--color-crt-amber)',
  crtAmberDim: 'var(--color-crt-amber-dim)',
  crtScreen: 'var(--color-crt-screen)',
  crtScreenLight: 'var(--color-crt-screen-light)',

  // Team Colors
  teamFriendly: 'var(--color-team-friendly)',
  teamFriendlyDim: 'var(--color-team-friendly-dim)',
  teamEnemy: 'var(--color-team-enemy)',
  teamEnemyDim: 'var(--color-team-enemy-dim)',

  // Base Grays
  bgBase: 'var(--color-bg-base)',
  bgDark: 'var(--color-bg-dark)',
  bgDarkBlue: 'var(--color-bg-dark-blue)',

  // UI Metals
  metal: 'var(--color-metal)',
  metalLight: 'var(--color-metal-light)',
  metalDark: 'var(--color-metal-dark)',
  panel: 'var(--color-panel)',

  // Text
  cream: 'var(--color-cream)',

  // Waveform States
  waveActive: 'var(--color-wave-active)',
  waveCompleted: 'var(--color-wave-completed)',
  waveWaiting: 'var(--color-wave-waiting)',

  // Transition Backgrounds
  transitionFriendlyBg: 'var(--color-transition-friendly-bg)',
  transitionEnemyBg: 'var(--color-transition-enemy-bg)',

  // Status Indicators
  statusConnected: 'var(--color-status-connected)',
  statusDisconnected: 'var(--color-status-disconnected)',
  statusPending: 'var(--color-status-pending)',
} as const;

// ============================================================
// Device Appearance Colors
// ============================================================

export const deviceColors = {
  frame: 'var(--color-device-frame)',
  frameLight: 'var(--color-device-frame-light)',
  frameDark: 'var(--color-device-frame-dark)',
  labelBg: 'var(--color-device-label-bg)',
  labelBorder: 'var(--color-device-label-border)',
  screw: 'var(--color-device-screw)',
  screwSlot: 'var(--color-device-screw-slot)',
} as const;

// ============================================================
// Screen Effect Colors
// ============================================================

export const screenEffectColors = {
  reflection: 'var(--color-screen-reflection)',
  shadow: 'var(--color-screen-shadow)',
  vignette: 'var(--color-screen-vignette)',
  scanline: 'var(--color-screen-scanline)',
} as const;

// ============================================================
// Spacing Tokens
// ============================================================

export const spacing = {
  xs: 'var(--spacing-xs)',
  sm: 'var(--spacing-sm)',
  md: 'var(--spacing-md)',
  lg: 'var(--spacing-lg)',
  xl: 'var(--spacing-xl)',
  '2xl': 'var(--spacing-2xl)',
} as const;

// ============================================================
// Radius Tokens
// ============================================================

export const radius = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  full: 'var(--radius-full)',
} as const

// ============================================================
// Tension Level Types
// ============================================================

export type TensionLevel = 'normal' | 'warning' | 'tense' | 'critical';

// ============================================================
// Friendly View Tension Config (Green Theme)
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
// Opponent View Tension Config (Blue Theme)
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
// ============================================================

export const encryptorTensionConfig = {
  normal: {
    ...tensionConfig.normal,
    emoji: '(\u2022\u203f\u2022)',
    message: '\u4e13\u6ce8\u52a0\u5bc6\u4e2d...',
    glowIntensity: 1,
  },
  warning: {
    ...tensionConfig.warning,
    emoji: '(\u2022_\u2022;)',
    message: '\u65f6\u95f4\u4e0d\u591a\u4e86...',
    glowIntensity: 1.2,
  },
  tense: {
    ...tensionConfig.tense,
    emoji: '(\u00b0\u25b3\u00b0;)',
    message: '\u5feb\u5feb\u5feb\uff01',
    glowIntensity: 1.5,
  },
  critical: {
    ...tensionConfig.critical,
    emoji: '(\u00b0\u0414\u00b0;)',
    message: '\uff01\uff01\uff01',
    glowIntensity: 2,
  },
} as const;

// ============================================================
// Raw Hex Values (for canvas 2D context and computed styles)
// ============================================================

export const rawColors = {
  // CRT Display
  crtScreen: '#0a0f0a',
  crtScreenLight: '#1a2a1a',
  crtPhosphor: '#00ff88',
  crtPhosphorDim: '#2a4a3a',
  crtAmber: '#ffaa00',
  crtAmberDim: '#4a3a2a',

  // Team Colors
  teamFriendly: '#00ff88',
  teamFriendlyDim: '#3d5544',
  teamEnemy: '#ff4444',
  teamEnemyDim: '#442222',

  // Base Grays
  bgBase: '#1a1a1a',
  bgDark: '#0a0f0a',
  bgDarkBlue: '#0a0f1a',

  // UI Metals
  metal: '#4a4a4a',
  metalLight: '#6a6a6a',
  metalDark: '#2a2a2a',
  panel: '#3a3a3a',

  // Text
  cream: '#f5f0e6',

  // Device
  deviceFrame: '#2a2a2a',
  deviceFrameLight: '#3a3a3a',
  deviceFrameDark: '#1a1a1a',
  deviceLabelBg: '#1a1a1a',
  deviceLabelBorder: '#3a3a3a',
  deviceScrew: '#4a4a4a',
  deviceScrewSlot: '#2a2a2a',

  // Status
  statusConnected: '#00ff88',
  statusDisconnected: '#ff4444',
  statusPending: '#ffaa00',

  // Opponent view colors
  opponentNormalBorder: '#2a4a6a',
  opponentNormalBg: '#1a2a3a',

  // Tension colors
  tensionNormalBg: '#1a2f1a',
  tensionNormalText: '#00ff88',
  tensionWarningBg: '#2f2a1a',
  tensionWarningText: '#88ff00',
  tensionTenseBg: '#2f1a1a',
  tensionTenseText: '#ffaa00',
  tensionCriticalBg: '#3a1010',
  tensionCriticalText: '#ff4444',
} as const;

// ============================================================
// Waveform/Oscilloscope State Config
// Note: Uses hex values for canvas 2D context compatibility
// ============================================================

export const waveConfig = {
  active: {
    color: '#00ff88',
    borderColor: '#00ff88',
    amplitude: 25,
    frequency: 0.05,
    speed: 1.5,
    glowIntensity: 10,
  },
  completed: {
    color: '#3d5544',
    borderColor: '#3d5544',
    amplitude: 8,
    frequency: 0.02,
    speed: 0.3,
    glowIntensity: 3,
  },
  waiting: {
    color: '#1a2f1a',
    borderColor: '#1a2f1a',
    amplitude: 2,
    frequency: 0,
    speed: 0,
    glowIntensity: 0,
  },
} as const;

export type WaveState = keyof typeof waveConfig;

// ============================================================
// Transition Overlay Config
// ============================================================

export type TransitionRole = 'encryptor' | 'teammate' | 'opponent';

export const transitionConfig: Record<TransitionRole, { text: string; color: string; bgColor: string }> = {
  encryptor: {
    text: '\u52a0\u5bc6\u5df2\u53d1\u9001',
    color: 'var(--color-team-friendly)',
    bgColor: 'var(--color-transition-friendly-bg)',
  },
  teammate: {
    text: '\u51c6\u5907\u89e3\u7801',
    color: 'var(--color-team-friendly)',
    bgColor: 'var(--color-transition-friendly-bg)',
  },
  opponent: {
    text: '\u4fe1\u53f7\u622a\u83b7',
    color: 'var(--color-team-enemy)',
    bgColor: 'var(--color-transition-enemy-bg)',
  },
} as const;
