import { useEffect, useRef } from 'react';

export type SelectorStatus = 'waiting' | 'thinking' | 'locked';
export type SelectorResult = 'pending' | 'correct' | 'wrong';
export type SelectorTheme = 'friendly' | 'enemy';

interface Props {
  digit: number | null;               // 1-4 if chosen; null = not chosen
  status: SelectorStatus;
  result?: SelectorResult;            // optional evaluation overlay
  correctDigit?: number;              // shown as ghost on wrong
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
}

const PALETTE: Record<SelectorTheme, Palette> = {
  friendly: {
    bg: '#04130a',
    phosphor: '#7CFFA0',
    bloom: 'rgba(124,255,160,0.55)',
    shadow: 'rgba(124,255,160,0.9)',
    grid: 'rgba(124,255,160,0.1)',
    gridAxis: 'rgba(124,255,160,0.25)',
    label: 'rgba(180,255,200,0.78)',
    correctPhosphor: '#7CFFA0',
    correctShadow: 'rgba(124,255,160,1)',
    wrongPhosphor: '#FF5B78',
    wrongShadow: 'rgba(255,91,120,1)',
  },
  enemy: {
    bg: '#140508',
    phosphor: '#FF708A',
    bloom: 'rgba(255,112,138,0.55)',
    shadow: 'rgba(255,112,138,0.9)',
    grid: 'rgba(255,112,138,0.1)',
    gridAxis: 'rgba(255,112,138,0.28)',
    label: 'rgba(255,180,195,0.78)',
    correctPhosphor: '#FF708A',
    correctShadow: 'rgba(255,112,138,1)',
    wrongPhosphor: '#FF708A',
    wrongShadow: 'rgba(255,112,138,1)',
  },
};

const SAMPLE_RATE = 90;

// Y in centered coords (-0.5..0.5) for each digit row
function rowYCentered(row: number): number {
  // Row 1 top, row 4 bottom. Map 1..4 → -0.35..0.35
  const clamp = Math.max(1, Math.min(4, row));
  const t = (clamp - 1) / 3; // 0..1
  return -0.35 + t * 0.7;
}

function selectorSample(
  t: number,
  digit: number | null,
  status: SelectorStatus,
  hopSeedRef: { seed: number; at: number; current: number },
): number {
  if (status === 'locked' && digit && digit >= 1 && digit <= 4) {
    // Tiny phosphor flicker to feel alive
    const flicker = Math.sin(t * 16) * 0.005;
    return rowYCentered(digit) + flicker;
  }
  if (status === 'thinking') {
    // Random hops every ~180ms between rows 1..4
    if (t - hopSeedRef.at > 0.18) {
      hopSeedRef.at = t;
      hopSeedRef.seed = (hopSeedRef.seed * 2654435761 + 1) >>> 0;
      const next = (hopSeedRef.seed % 4) + 1;
      hopSeedRef.current = next;
    }
    const jitter = Math.sin(t * 50) * 0.008;
    return rowYCentered(hopSeedRef.current) + jitter;
  }
  // waiting: slow continuous sweep through rows as a sine that lingers near each level
  const phase = Math.sin(t * 0.45);       // -1..1
  return phase * 0.32;
}

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

    // ---- Offscreen graticule with 4 digit rows ----
    const grat = document.createElement('canvas');
    grat.width = width * dpr;
    grat.height = height * dpr;
    const gctx = grat.getContext('2d');
    if (gctx) {
      gctx.scale(dpr, dpr);
      // Vertical grid (8 divisions)
      for (let i = 0; i <= 8; i++) {
        const x = (i / 8) * width + 0.5;
        gctx.strokeStyle = pal.grid;
        gctx.lineWidth = 0.4;
        gctx.beginPath();
        gctx.moveTo(x, 0);
        gctx.lineTo(x, height);
        gctx.stroke();
      }
      // 4 digit rows — stronger
      for (let r = 1; r <= 4; r++) {
        const y = (rowYCentered(r) + 0.5) * height + 0.5;
        gctx.strokeStyle = pal.gridAxis;
        gctx.lineWidth = 0.6;
        gctx.setLineDash([1.5, 2]);
        gctx.beginPath();
        gctx.moveTo(0, y);
        gctx.lineTo(width, y);
        gctx.stroke();
        gctx.setLineDash([]);
      }
      // Row digit labels on the left edge
      gctx.fillStyle = pal.label;
      gctx.font = '6px "Courier Prime", ui-monospace, monospace';
      gctx.textBaseline = 'middle';
      for (let r = 1; r <= 4; r++) {
        const y = (rowYCentered(r) + 0.5) * height;
        gctx.fillText(String(r), 2, y);
      }
    }

    // ---- Scrolling sample buffer ----
    const BUFFER_SIZE = Math.max(2, Math.floor(width));
    const buffer = new Float32Array(BUFFER_SIZE);

    const hopSeedRef = { seed: 1, at: -1, current: digit && digit >= 1 && digit <= 4 ? digit : 1 };

    // Seed buffer
    const seedStart = -BUFFER_SIZE / SAMPLE_RATE;
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const t = seedStart + i / SAMPLE_RATE;
      buffer[i] = selectorSample(t, digit, status, hopSeedRef);
    }

    let sampleTime = 0;
    let sampleAccumulator = 0;
    const startT = performance.now();
    let lastT = startT;

    // Step-style polyline drawing between sample points (staircase look)
    const drawStep = (ySamples: Float32Array, offsetX: number, stroke: string, lineWidth: number, blur: number, shadowColor: string) => {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = stroke;
      ctx.shadowBlur = blur;
      ctx.shadowColor = shadowColor;
      ctx.beginPath();
      ctx.moveTo(offsetX, (ySamples[0] + 0.5) * height);
      for (let i = 1; i < BUFFER_SIZE; i++) {
        const px = i + offsetX;
        const prevY = (ySamples[i - 1] + 0.5) * height;
        const newY = (ySamples[i] + 0.5) * height;
        ctx.lineTo(px, prevY);    // horizontal on prev row
        if (newY !== prevY) ctx.lineTo(px, newY); // vertical jump
      }
      ctx.stroke();
    };

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
      ctx.fillText(label, width - 28, 2);
      // Digit badge (locked)
      if (status === 'locked' && digit) {
        ctx.font = '9px "Bebas Neue", sans-serif';
        ctx.fillStyle = pal.phosphor;
        ctx.fillText(String(digit), 10, 2);
      }
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

    // Reduced-motion fallback
    if (reducedMotion) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(grat, 0, 0, width, height);
      const samp = new Float32Array(BUFFER_SIZE);
      for (let i = 0; i < BUFFER_SIZE; i++) samp[i] = selectorSample(1, digit, status, hopSeedRef);
      drawStep(samp, 0, pal.phosphor, 1.2, 5, pal.shadow);
      ctx.shadowBlur = 0;
      drawLabel();
      drawOverlays();
      return;
    }

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    const render = (now: number) => {
      const dt = Math.min(0.08, (now - lastT) / 1000);
      lastT = now;
      void startT;

      sampleAccumulator += dt * SAMPLE_RATE;
      const advance = Math.floor(sampleAccumulator);
      sampleAccumulator -= advance;
      if (advance > 0) {
        if (advance < BUFFER_SIZE) buffer.copyWithin(0, advance);
        const n = Math.min(advance, BUFFER_SIZE);
        for (let i = 0; i < n; i++) {
          const t = sampleTime + (i + 1) / SAMPLE_RATE;
          buffer[BUFFER_SIZE - n + i] = selectorSample(t, digit, status, hopSeedRef);
        }
        sampleTime += advance / SAMPLE_RATE;
      }

      // Persistence fade
      ctx.fillStyle = pal.bg;
      ctx.globalAlpha = status === 'locked' ? 0.5 : 0.32;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      ctx.drawImage(grat, 0, 0, width, height);

      // Locked row tint background — gentle band behind the active row
      if (status === 'locked' && digit) {
        const y = (rowYCentered(digit) + 0.5) * height;
        const tintColor =
          result === 'correct' ? 'rgba(124,255,160,0.15)'
          : result === 'wrong' ? 'rgba(255,91,120,0.18)'
          : `${pal.phosphor}22`;
        ctx.fillStyle = tintColor;
        ctx.fillRect(0, y - 5, width, 10);
      }

      // Ghost line on correct digit row when guess is wrong
      if (status === 'locked' && result === 'wrong' && correctDigit && correctDigit !== digit) {
        const gy = (rowYCentered(correctDigit) + 0.5) * height;
        ctx.strokeStyle = 'rgba(124,255,160,0.6)';
        ctx.lineWidth = 0.9;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(124,255,160,0.8)';
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
      }

      // Main phosphor trace — evaluation-colored when locked with result
      const traceColor =
        status === 'locked' && result === 'correct' ? pal.correctPhosphor
        : status === 'locked' && result === 'wrong' ? pal.wrongPhosphor
        : pal.phosphor;
      const traceShadow =
        status === 'locked' && result === 'correct' ? pal.correctShadow
        : status === 'locked' && result === 'wrong' ? pal.wrongShadow
        : pal.shadow;

      // Bloom + core
      drawStep(buffer, 0, traceColor + '88', 3, 10, traceShadow);
      drawStep(buffer, 0, traceColor, 1.2, 5, traceShadow);
      ctx.shadowBlur = 0;

      // Rightmost write-head dot
      {
        const lastY = (buffer[BUFFER_SIZE - 1] + 0.5) * height;
        ctx.fillStyle = traceColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = traceShadow;
        ctx.beginPath();
        ctx.arc(BUFFER_SIZE - 1, lastY, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
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
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5), inset 0 0 8px rgba(0,0,0,0.6)',
      }}
      className={className}
      role="img"
      aria-label={ariaLabel}
    />
  );
}

export default SelectorOscilloscope;
