// Phosphor palette for the canvas-rendered UI (mirrors the DOM theme).

export const T = {
  bg: '#160a05',
  bgPanel: 'rgba(8, 4, 2, 0.55)',
  text: '#f3e6cf',
  dim: 'rgba(243, 230, 207, 0.68)',
  faint: 'rgba(243, 230, 207, 0.5)',
  amber: '#ffb45e',
  amberDim: 'rgba(255, 180, 94, 0.45)',
  amberFaint: 'rgba(255, 180, 94, 0.12)',
  red: '#ff5a3c',
  redDim: 'rgba(255, 90, 60, 0.45)',
  navy: '#7ea0e0',
  teamA: '#2c4a8f',
  teamB: '#8f3a2e',
  brass: '#8a6a2e',
  line: 'rgba(255, 180, 94, 0.22)',
  slot: 'rgba(5, 2, 1, 0.7)',

  // paper (codebook / manual)
  paper: '#e8dcc8',
  paperDark: '#d4c4a8',
  ink: '#2a2018',
  pBrass: '#8b6508',
  stamp: '#b22222',

  fontCjk: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  fontMono: '"SF Mono", "JetBrains Mono", "Cascadia Code", ui-monospace, Menlo, monospace',
};

/** Global font scale: view layouts were designed at 1536px canvas width,
 *  which downscales to ~800px on common displays — bump glyphs so the
 *  effective on-screen size stays ≥14px for body text. */
const FS = 1.3;

export const font = (size: number, weight = 400, mono = false): string =>
  `${weight} ${Math.round(size * FS)}px ${mono ? T.fontMono : T.fontCjk}`;
