import { useEffect, useRef } from 'react';

export type SelectorStatus = 'waiting' | 'thinking' | 'locked';
export type SelectorResult = 'pending' | 'correct' | 'wrong';
export type SelectorTheme = 'friendly' | 'enemy';

interface Props {
  digit: number | null;
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
  bloom: string;
  shadow: string;
  grid: string;
  gridAxis: string;
  label: string;
  correctPhosphor: string;
  correctShadow: string;
  wrongPhosphor: string;
  wrongShadow: string;
  ghostPhosphor: string;
  ghostShadow: string;
}

const PALETTE: Record<SelectorTheme, Palette> = {
  friendly: {
    bg: '#04130a',
    phosphor: '#9EFFB5',
    bloom: 'rgba(158,255,181,0.55)',
    shadow: 'rgba(158,255,181,1)',
    grid: 'rgba(158,255,181,0.06)',
    gridAxis: 'rgba(158,255,181,0.18)',
    label: 'rgba(200,255,215,0.82)',
    correctPhosphor: '#9EFFB5',
    correctShadow: 'rgba(158,255,181,1)',
    wrongPhosphor: '#FF6B82',
    wrongShadow: 'rgba(255,107,130,1)',
    ghostPhosphor: '#9EFFB5',
    ghostShadow: 'rgba(158,255,181,0.8)',
  },
  enemy: {
    bg: '#140508',
    phosphor: '#FFA070',
    bloom: 'rgba(255,160,112,0.55)',
    shadow: 'rgba(255,160,112,1)',
    grid: 'rgba(255,160,112,0.06)',
    gridAxis: 'rgba(255,160,112,0.2)',
    label: 'rgba(255,200,170,0.82)',
    correctPhosphor: '#FFA070',
    correctShadow: 'rgba(255,160,112,1)',
    wrongPhosphor: '#FF6B82',
    wrongShadow: 'rgba(255,107,130,1)',
    ghostPhosphor: '#FFD080',
    ghostShadow: 'rgba(255,208,128,0.8)',
  },
};

export function SelectorOscilloscope({
  digit,
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

    // ---- Offscreen graticule: subtle 8x4 dots + center crosshair (no row lines) ----
    const grat = document.createElement('canvas');
    grat.width = width * dpr;
    grat.height = height * dpr;
    const gctx = grat.getContext('2d');
    if (gctx) {
      gctx.scale(dpr, dpr);
      // faint dot grid
      gctx.fillStyle = pal.grid;
      for (let ix = 1; ix < 8; ix++) {
        for (let iy = 1; iy < 4; iy++) {
          const x = (ix / 8) * width;
          const y = (iy / 4) * height;
          gctx.fillRect(x - 0.5, y - 0.5, 1, 1);
        }
      }
      // center crosshair
      gctx.strokeStyle = pal.gridAxis;
      gctx.lineWidth = 0.7;
      gctx.beginPath();
      gctx.moveTo(width / 2 - 3, height / 2);
      gctx.lineTo(width / 2 + 3, height / 2);
      gctx.moveTo(width / 2, height / 2 - 3);
      gctx.lineTo(width / 2, height / 2 + 3);
      gctx.stroke();
    }

    let startT = performance.now();

    const drawLabel = () => {
      const label =
        status === 'waiting' ? 'SCAN'
        : status === 'thinking' ? 'EVAL'
        : result === 'correct' ? 'MATCH'
        : result === 'wrong' ? 'MISS'
        : 'LOCK';
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

    // Draw a big nixie-style digit with layered phosphor bloom
    const drawDigit = (
      digitStr: string,
      color: string,
      shadow: string,
      cx: number,
      cy: number,
      size: number,
      alpha = 1,
      flicker = 0,
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha * (1 - flicker);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${size}px "Bebas Neue", "Impact", sans-serif`;
      // Outer huge bloom
      ctx.shadowBlur = size * 0.8;
      ctx.shadowColor = shadow;
      ctx.fillStyle = color;
      ctx.fillText(digitStr, cx, cy);
      // Mid bloom
      ctx.shadowBlur = size * 0.35;
      ctx.fillText(digitStr, cx, cy);
      // Inner crisp
      ctx.shadowBlur = 2;
      ctx.fillText(digitStr, cx, cy);
      ctx.restore();
    };

    // Draw ghost outlines of all 4 digits (nixie cathode stack feel)
    const drawDigitStack = (activeDigit: number | null, color: string, shadow: string, cx: number, cy: number, size: number, t: number) => {
      for (let d = 1; d <= 4; d++) {
        if (d === activeDigit) continue;
        // Slight horizontal offset per digit so the stack isn't all overlapping center
        const off = (d - 2.5) * 3;
        const flicker = 0.02 + Math.abs(Math.sin(t * 0.003 + d)) * 0.015;
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${size}px "Bebas Neue", "Impact", sans-serif`;
        ctx.shadowBlur = 3;
        ctx.shadowColor = shadow;
        ctx.fillStyle = color;
        ctx.fillText(String(d), cx + off, cy + (d % 2 === 0 ? 0.5 : -0.5) + flicker);
        ctx.restore();
      }
    };

    // Scanning pattern for waiting — horizontal sweep line
    const drawScan = (t: number) => {
      const y = (Math.sin(t / 700) * 0.45 + 0.5) * height;
      const grad = ctx.createLinearGradient(0, y - 3, 0, y + 3);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, pal.bloom);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 3, width, 6);
      // small noise blip
      ctx.strokeStyle = pal.phosphor;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.8;
      ctx.shadowBlur = 6;
      ctx.shadowColor = pal.shadow;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let i = 0; i <= width; i += 3) {
        const noise = Math.sin((i + t * 0.02) * 0.35) * 1.2;
        ctx.lineTo(i, y + noise);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    // Reduced motion static frame
    if (reducedMotion) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(grat, 0, 0, width, height);
      if (status === 'locked' && digit) {
        const color = result === 'correct' ? pal.correctPhosphor : result === 'wrong' ? pal.wrongPhosphor : pal.phosphor;
        const shadow = result === 'correct' ? pal.correctShadow : result === 'wrong' ? pal.wrongShadow : pal.shadow;
        drawDigit(String(digit), color, shadow, width / 2, height / 2 + 1, 34);
      }
      drawLabel();
      drawOverlays();
      return;
    }

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    const render = (now: number) => {
      const t = now - startT;

      // Persistence fade
      ctx.fillStyle = pal.bg;
      ctx.globalAlpha = status === 'locked' ? 0.55 : 0.4;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      ctx.drawImage(grat, 0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 + 1;

      if (status === 'waiting') {
        drawScan(t);
      } else if (status === 'thinking') {
        // Cycle digits 1-4 every 220ms with soft crossfade
        const period = 220;
        const phase = (t % period) / period; // 0..1
        const activeIdx = Math.floor(t / period) % 4;
        const nextIdx = (activeIdx + 1) % 4;
        const active = activeIdx + 1;
        const next = nextIdx + 1;
        // Crossfade in last 30% of period
        const fadeIn = Math.max(0, (phase - 0.7) / 0.3);
        drawDigitStack(active, pal.phosphor, pal.shadow, cx, cy, 32, t);
        drawDigit(String(active), pal.phosphor, pal.shadow, cx, cy, 32, 1 - fadeIn);
        if (fadeIn > 0) drawDigit(String(next), pal.phosphor, pal.shadow, cx, cy, 32, fadeIn);
      } else if (status === 'locked' && digit) {
        // Subtle nixie flicker
        const flicker = 0.015 + (Math.sin(t * 0.018) + Math.sin(t * 0.043)) * 0.01;
        const color = result === 'correct' ? pal.correctPhosphor : result === 'wrong' ? pal.wrongPhosphor : pal.phosphor;
        const shadow = result === 'correct' ? pal.correctShadow : result === 'wrong' ? pal.wrongShadow : pal.shadow;
        // Ghost stack behind
        drawDigitStack(digit, pal.phosphor, pal.shadow, cx, cy, 32, t);
        // Active digit
        drawDigit(String(digit), color, shadow, cx, cy, 34, 1, flicker);

        // Wrong state: small green ghost of correct answer on the right
        if (result === 'wrong' && correctDigit && correctDigit !== digit) {
          ctx.save();
          ctx.font = '7px "Courier Prime", ui-monospace, monospace';
          ctx.fillStyle = pal.ghostPhosphor;
          ctx.globalAlpha = 0.75;
          ctx.textBaseline = 'middle';
          ctx.shadowBlur = 3;
          ctx.shadowColor = pal.ghostShadow;
          ctx.fillText('→', width - 22, cy);
          ctx.restore();
          drawDigit(
            String(correctDigit),
            pal.ghostPhosphor,
            pal.ghostShadow,
            width - 10,
            cy,
            16,
            0.85,
          );
        }
      }

      drawLabel();
      drawOverlays();

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [digit, status, result, correctDigit, theme, width, height]);

  const ariaLabel =
    status === 'waiting' ? 'No selection yet'
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
