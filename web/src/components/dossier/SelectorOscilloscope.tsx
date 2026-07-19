import { useEffect, useRef } from 'react';

export type SelectorStatus = 'waiting' | 'thinking' | 'locked';
export type SelectorResult = 'pending' | 'correct' | 'wrong';
export type SelectorTheme = 'friendly' | 'enemy';

interface Props {
  digit?: number | null;
  status: SelectorStatus;
  result?: SelectorResult;
  correctDigit?: number;
  theme: SelectorTheme;
  width?: number;
  height?: number;
  className?: string;
}

interface Palette {
  bg: string;
  phosphor: string;
  phosphorRGB: [number, number, number];
  shadow: string;
  grid: string;
  gridAxis: string;
  label: string;
  correctPhosphor: string;
  correctRGB: [number, number, number];
  correctShadow: string;
  wrongPhosphor: string;
  wrongRGB: [number, number, number];
  wrongShadow: string;
  ghostPhosphor: string;
  ghostShadow: string;
  aberrLeft: string;
  aberrRight: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const PALETTE: Record<SelectorTheme, Palette> = {
  friendly: {
    bg: '#04130a',
    phosphor: '#9EFFB5',
    phosphorRGB: hexToRgb('#9EFFB5'),
    shadow: 'rgba(158,255,181,1)',
    grid: 'rgba(158,255,181,0.06)',
    gridAxis: 'rgba(158,255,181,0.18)',
    label: 'rgba(200,255,215,0.82)',
    correctPhosphor: '#9EFFB5',
    correctRGB: hexToRgb('#9EFFB5'),
    correctShadow: 'rgba(158,255,181,1)',
    wrongPhosphor: '#FF6B82',
    wrongRGB: hexToRgb('#FF6B82'),
    wrongShadow: 'rgba(255,107,130,1)',
    ghostPhosphor: '#9EFFB5',
    ghostShadow: 'rgba(158,255,181,0.8)',
    aberrLeft: 'rgba(255,110,110,0.30)',
    aberrRight: 'rgba(110,190,255,0.26)',
  },
  enemy: {
    bg: '#140508',
    phosphor: '#FFA070',
    phosphorRGB: hexToRgb('#FFA070'),
    shadow: 'rgba(255,160,112,1)',
    grid: 'rgba(255,160,112,0.06)',
    gridAxis: 'rgba(255,160,112,0.2)',
    label: 'rgba(255,200,170,0.82)',
    correctPhosphor: '#FFA070',
    correctRGB: hexToRgb('#FFA070'),
    correctShadow: 'rgba(255,160,112,1)',
    wrongPhosphor: '#FF6B82',
    wrongRGB: hexToRgb('#FF6B82'),
    wrongShadow: 'rgba(255,107,130,1)',
    ghostPhosphor: '#FFD080',
    ghostShadow: 'rgba(255,208,128,0.8)',
    aberrLeft: 'rgba(255,110,110,0.30)',
    aberrRight: 'rgba(110,190,255,0.22)',
  },
};

// Tunables — design docs reference these numbers, keep in sync if changing.
const TRANSITION_MS = 450;
const NOISE_INTENSITY = { waiting: 0.05, thinking: 0.17, locked: 0.025 } as const;
const SCAN_PERIOD_MS = 1700;
const SCAN_BAND_SIGMA = 6;
const JITTER_PEAK_PX = 1.6;
const CHROMA_PEAK_PX = 2.4;
const CHROMA_SETTLED_PX = 0.9;
const LOCKED_BREATHE_AMP = 0.015;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function SelectorOscilloscope({
  digit = null,
  status,
  result = 'pending',
  correctDigit,
  theme,
  width = 104,
  height = 48,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Live prop refs read inside the render loop so the loop can run
  // continuously without restarting (preserves persistence trail + transition state).
  const statusRef = useRef(status);
  const digitRef = useRef(digit);
  const resultRef = useRef(result);
  const correctDigitRef = useRef(correctDigit);
  const transitionStartRef = useRef<number | null>(null);
  // Per-instance scan-band phase offset so multiple scopes don't sweep in lockstep.
  const scanPhaseOffsetRef = useRef(Math.random());

  useEffect(() => {
    if (statusRef.current !== status && status === 'locked') {
      transitionStartRef.current = performance.now();
    } else if (status !== 'locked') {
      transitionStartRef.current = null;
    }
    statusRef.current = status;
    digitRef.current = digit;
    resultRef.current = result;
    correctDigitRef.current = correctDigit;
  }, [status, digit, result, correctDigit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pal = PALETTE[theme];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- Offscreen graticule — full grid, matches SignalOscilloscope's chrome ----
    const grat = document.createElement('canvas');
    grat.width = width * dpr;
    grat.height = height * dpr;
    const gctx = grat.getContext('2d');
    if (gctx) {
      gctx.scale(dpr, dpr);
      for (let i = 0; i <= 10; i++) {
        const x = (i / 10) * width + 0.5;
        gctx.strokeStyle = i === 5 ? pal.gridAxis : pal.grid;
        gctx.lineWidth = i === 5 ? 0.8 : 0.5;
        gctx.beginPath();
        gctx.moveTo(x, 0);
        gctx.lineTo(x, height);
        gctx.stroke();
      }
      for (let i = 0; i <= 6; i++) {
        const y = (i / 6) * height + 0.5;
        gctx.strokeStyle = i === 3 ? pal.gridAxis : pal.grid;
        gctx.lineWidth = i === 3 ? 0.8 : 0.5;
        gctx.beginPath();
        gctx.moveTo(0, y);
        gctx.lineTo(width, y);
        gctx.stroke();
      }
      gctx.strokeStyle = pal.gridAxis;
      gctx.lineWidth = 0.8;
      gctx.beginPath();
      gctx.moveTo(width / 2 - 3, height / 2);
      gctx.lineTo(width / 2 + 3, height / 2);
      gctx.moveTo(width / 2, height / 2 - 3);
      gctx.lineTo(width / 2, height / 2 + 3);
      gctx.stroke();
    }

    // ---- Snow buffer — re-randomized each frame ----
    const noiseW = Math.ceil(width);
    const noiseH = Math.ceil(height);
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = noiseW;
    noiseCanvas.height = noiseH;
    const nctx = noiseCanvas.getContext('2d');
    const noiseImg = nctx?.createImageData(noiseW, noiseH);

    const drawSnow = (intensity: number, color: [number, number, number]) => {
      if (!nctx || !noiseImg || intensity <= 0) return;
      const data = noiseImg.data;
      const [r, g, b] = color;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random();
        if (v >= intensity) {
          data[i + 3] = 0;
        } else {
          const lum = v / intensity;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 70 + Math.floor(lum * 165);
        }
      }
      nctx.putImageData(noiseImg, 0, 0);
      ctx.drawImage(noiseCanvas, 0, 0, width, height);
    };

    // ---- Soft downward scan band, organic non-linear sweep ----
    const drawScanBand = (t: number, alphaScale: number) => {
      const offsetT = (t + scanPhaseOffsetRef.current * SCAN_PERIOD_MS) % SCAN_PERIOD_MS;
      const rawPhase = offsetT / SCAN_PERIOD_MS;
      const phase = rawPhase + 0.05 * Math.sin(rawPhase * Math.PI * 2);
      const yCenter = phase * (height + SCAN_BAND_SIGMA * 4) - SCAN_BAND_SIGMA * 2;
      const sigma = SCAN_BAND_SIGMA;
      const peakAlpha = 0.22 * alphaScale;
      ctx.save();
      ctx.fillStyle = pal.phosphor;
      const range = sigma * 2.5;
      for (let dy = -range; dy <= range; dy += 1) {
        const y = yCenter + dy;
        if (y < 0 || y >= height) continue;
        const a = peakAlpha * Math.exp(-(dy * dy) / (sigma * sigma * 0.7));
        ctx.globalAlpha = a;
        ctx.fillRect(0, Math.floor(y), width, 1);
      }
      ctx.restore();
    };

    const drawLabel = (label: string) => {
      ctx.font = '7px "Courier Prime", ui-monospace, monospace';
      ctx.fillStyle = pal.label;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(label, 3, 2);
    };

    const drawOverlays = () => {
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#000';
      for (let y = 0; y < height; y += 2) ctx.fillRect(0, y, width, 1);
      ctx.globalAlpha = 1;
      const vg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 1.25);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);
    };

    const drawDigit = (
      digitStr: string,
      mainColor: string,
      mainShadow: string,
      cx: number,
      cy: number,
      size: number,
      alpha: number,
      chromaPx: number,
    ) => {
      ctx.save();
      ctx.font = `${size}px "Bebas Neue", "Impact", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = alpha;

      // Chromatic aberration ghosts (additive)
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(255,110,110,0.5)';
      ctx.fillStyle = pal.aberrLeft;
      ctx.fillText(digitStr, cx - chromaPx, cy);
      ctx.shadowColor = 'rgba(110,190,255,0.5)';
      ctx.fillStyle = pal.aberrRight;
      ctx.fillText(digitStr, cx + chromaPx, cy);
      ctx.globalCompositeOperation = 'source-over';

      // Phosphor bloom — outer wide, mid, inner crisp
      ctx.shadowBlur = size * 0.8;
      ctx.shadowColor = mainShadow;
      ctx.fillStyle = mainColor;
      ctx.fillText(digitStr, cx, cy);
      ctx.shadowBlur = size * 0.35;
      ctx.fillText(digitStr, cx, cy);
      ctx.shadowBlur = 2;
      ctx.fillText(digitStr, cx, cy);
      ctx.restore();
    };

    const drawGhostCorrectDigit = (n: number, alpha: number) => {
      const cy = height / 2 + 1;
      ctx.save();
      ctx.font = '7px "Courier Prime", ui-monospace, monospace';
      ctx.fillStyle = pal.ghostPhosphor;
      ctx.globalAlpha = 0.75 * alpha;
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 3;
      ctx.shadowColor = pal.ghostShadow;
      ctx.fillText('→', width - 22, cy);
      ctx.restore();
      drawDigit(String(n), pal.ghostPhosphor, pal.ghostShadow, width - 10, cy, 16, 0.85 * alpha, 0.4);
    };

    const labelFor = (s: SelectorStatus, r: SelectorResult): string => {
      if (s === 'waiting') return 'SCAN';
      if (s === 'thinking') return 'EVAL';
      if (r === 'correct') return 'MATCH';
      if (r === 'wrong') return 'MISS';
      return 'LOCK';
    };

    const noiseColorFor = (s: SelectorStatus, r: SelectorResult): [number, number, number] => {
      if (s === 'locked' && r === 'wrong') return pal.wrongRGB;
      if (s === 'locked' && r === 'correct') return pal.correctRGB;
      return pal.phosphorRGB;
    };

    if (reducedMotion) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(grat, 0, 0, width, height);
      drawSnow(NOISE_INTENSITY[status], noiseColorFor(status, result));
      if (status === 'locked' && digit) {
        const mainColor = result === 'correct' ? pal.correctPhosphor
          : result === 'wrong' ? pal.wrongPhosphor : pal.phosphor;
        const mainShadow = result === 'correct' ? pal.correctShadow
          : result === 'wrong' ? pal.wrongShadow : pal.shadow;
        drawDigit(String(digit), mainColor, mainShadow, width / 2, height / 2 + 1, 34, 1, CHROMA_SETTLED_PX);
        if (result === 'wrong' && correctDigit && correctDigit !== digit) {
          drawGhostCorrectDigit(correctDigit, 1);
        }
      }
      drawLabel(labelFor(status, result));
      drawOverlays();
      return;
    }

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    const startT = performance.now();

    const render = (now: number) => {
      const t = now - startT;
      const s = statusRef.current;
      const r = resultRef.current;
      const d = digitRef.current;
      const cd = correctDigitRef.current;

      // Lock transition progress in [0,1]; clamps at 1 once settled.
      const txStart = transitionStartRef.current;
      const inTransition = txStart !== null && s === 'locked';
      const tProgress = inTransition
        ? clamp((now - txStart) / TRANSITION_MS, 0, 1)
        : (s === 'locked' ? 1 : 0);
      const tEased = easeOutCubic(tProgress);

      // Persistence — extra fade once locked to let the digit sit cleanly.
      const persistAlpha = s === 'locked' ? lerp(0.42, 0.6, tEased) : 0.42;
      ctx.fillStyle = pal.bg;
      ctx.globalAlpha = persistAlpha;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      ctx.drawImage(grat, 0, 0, width, height);

      // Snow — non-locked uses base intensity; locked transitions from
      // thinking-density down to floor over TRANSITION_MS.
      const snowI = s === 'locked'
        ? lerp(NOISE_INTENSITY.thinking, NOISE_INTENSITY.locked, tEased)
        : NOISE_INTENSITY[s];
      drawSnow(snowI, noiseColorFor(s, r));

      // Scan band: full strength on thinking, fades out during the first 60% of locked transition.
      if (s === 'thinking') {
        drawScanBand(t, 1);
      } else if (s === 'locked' && tProgress < 0.6) {
        drawScanBand(t, 1 - tProgress / 0.6);
      }

      if (s === 'locked' && d) {
        // Digit emerges starting ~15% through the transition.
        const digitProgress = clamp((tProgress - 0.15) / 0.85, 0, 1);
        const digitAlpha = easeOutCubic(digitProgress);

        // Vertical jitter peaks at start, decays to 0 — like a tube settling.
        const jitterAmp = lerp(JITTER_PEAK_PX, 0, tEased);
        const jitterY = jitterAmp * (Math.random() - 0.5) * 2;

        // Chromatic aberration starts wide + noisy, settles to ±CHROMA_SETTLED_PX.
        const chromaBase = lerp(CHROMA_PEAK_PX, CHROMA_SETTLED_PX, tEased);
        const chromaJitter = (1 - tEased) * (Math.random() - 0.5) * 1.2;
        const chromaPx = chromaBase + chromaJitter;

        // Settled state — subtle two-tone breath so the tube reads as "powered on".
        const settled = tProgress >= 1;
        const breathe = settled
          ? 1 + LOCKED_BREATHE_AMP * Math.sin(t * 2 * Math.PI / 1500)
            + 0.008 * Math.sin(t * 2 * Math.PI / 730)
          : 1;

        const mainColor = r === 'correct' ? pal.correctPhosphor
          : r === 'wrong' ? pal.wrongPhosphor : pal.phosphor;
        const mainShadow = r === 'correct' ? pal.correctShadow
          : r === 'wrong' ? pal.wrongShadow : pal.shadow;

        drawDigit(
          String(d),
          mainColor,
          mainShadow,
          width / 2,
          height / 2 + 1 + jitterY,
          34,
          clamp(digitAlpha * breathe, 0, 1),
          chromaPx,
        );

        if (r === 'wrong' && cd && cd !== d) {
          // Ghost correct digit fades in late so it reads as "verdict, not guess".
          const ghostAlpha = clamp((tProgress - 0.85) / 0.15, 0, 1);
          if (ghostAlpha > 0) drawGhostCorrectDigit(cd, ghostAlpha);
        }
      }

      drawLabel(labelFor(s, r));
      drawOverlays();

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [theme, width, height]);

  const ariaLabel =
    status === 'waiting' ? 'Scanning, no signal'
    : status === 'thinking' ? 'Evaluating candidates'
    : digit ? `Selected ${digit}${result === 'correct' ? ', correct' : result === 'wrong' ? ', wrong' : ''}`
    : 'Locked';

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: 'block',
        borderRadius: 2,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.6)',
      }}
      className={className}
      role="img"
      aria-label={ariaLabel}
    />
  );
}

export default SelectorOscilloscope;
