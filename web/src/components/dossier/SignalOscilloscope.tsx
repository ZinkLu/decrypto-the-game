import { useEffect, useRef } from 'react';

export type SignalState = 'waiting' | 'active' | 'completed';
export type SignalTheme = 'friendly' | 'enemy';

interface Props {
  state: SignalState;
  theme: SignalTheme;
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
  aberrR: number;
  aberrB: number;
}

const PALETTE: Record<SignalTheme, Palette> = {
  friendly: {
    bg: '#04130a',
    phosphor: '#7CFFA0',
    bloom: 'rgba(124,255,160,0.55)',
    shadow: 'rgba(124,255,160,0.9)',
    grid: 'rgba(124,255,160,0.08)',
    gridAxis: 'rgba(124,255,160,0.2)',
    label: 'rgba(180,255,200,0.78)',
    aberrR: -0.9,
    aberrB: 0.9,
  },
  enemy: {
    bg: '#140508',
    phosphor: '#FF708A',
    bloom: 'rgba(255,112,138,0.55)',
    shadow: 'rgba(255,112,138,0.9)',
    grid: 'rgba(255,112,138,0.08)',
    gridAxis: 'rgba(255,112,138,0.22)',
    label: 'rgba(255,180,195,0.78)',
    aberrR: 0.9,
    aberrB: -0.9,
  },
};

// sample rate for the scrolling buffer: samples per second of virtual scope time
const SAMPLE_RATE = 90;

// Deterministic smooth pseudo-noise — three incommensurate sines
function smoothNoise(t: number): number {
  return (
    0.50 * Math.sin(7.3 * t + 0.11) +
    0.30 * Math.sin(13.1 * t + 0.87) +
    0.20 * Math.sin(19.7 * t + 1.73)
  );
}

// Higher-frequency micro-noise layer for phosphor grain
function microNoise(t: number): number {
  return 0.6 * Math.sin(101.7 * t + 2.1) + 0.4 * Math.sin(163.3 * t + 0.5);
}

// Gaussian-enveloped pulse centered at t0 — a sonar "ping"
function blip(t: number, t0: number, sigma: number, omega: number): number {
  const d = (t - t0) / sigma;
  return Math.exp(-d * d) * Math.sin(omega * (t - t0));
}

// Fourier carrier — sum of harmonics with 1/n² envelope → rich but smooth
function fourierCarrier(t: number): number {
  let v = 0;
  for (let n = 1; n <= 5; n++) v += (1 / (n * n)) * Math.sin(n * 16 * t);
  return v; // ~ in [-1.5, 1.5]
}

// FM-modulated single-tone (carrier with vibrato)
function fmCarrier(t: number): number {
  return Math.sin(22 * t + 0.6 * Math.sin(3 * t));
}

// Morse pattern encoded as on/off segments (dot, dash, gaps tuned for visual rhythm)
const MORSE_PATTERN: ReadonlyArray<readonly [number, 0 | 1]> = [
  [0.14, 1], [0.08, 0],       // dot
  [0.34, 1], [0.08, 0],       // dash
  [0.14, 1], [0.30, 0],       // dot + letter gap
  [0.34, 1], [0.08, 0],       // dash
  [0.14, 1], [0.08, 0],       // dot
  [0.34, 1], [0.08, 0],       // dash
  [0.34, 1], [0.60, 0],       // dash + word gap
  [0.14, 1], [0.08, 0],       // dot
  [0.14, 1], [0.08, 0],       // dot
  [0.14, 1], [0.08, 0],       // dot
  [0.34, 1], [0.60, 0],       // dash + word gap
];
const MORSE_TOTAL = MORSE_PATTERN.reduce((s, [d]) => s + d, 0);

// Soft-edged morse envelope (0–1) with sigmoid transitions to avoid hard clicks
function morseEnvelope(t: number): number {
  const local = ((t % MORSE_TOTAL) + MORSE_TOTAL) % MORSE_TOTAL;
  const soft = 0.022;
  let acc = 0;
  for (const [d, on] of MORSE_PATTERN) {
    if (local >= acc && local < acc + d) {
      const into = local - acc;
      const left = d - into;
      if (into < soft) return on * (into / soft);
      if (left < soft) return on * (left / soft);
      return on;
    }
    acc += d;
  }
  return 0;
}

// The three state × theme signal functions; all return values centered at 0
// with amplitude roughly in [-0.45, 0.45] so a shift by 0.5 fits the canvas.
function waitingSignal(t: number): number {
  const base = smoothNoise(t) * 0.02 + microNoise(t) * 0.01;
  // Periodic but non-obvious blip — phase-varies every loop
  const period = 3.3;
  const idx = Math.floor(t / period);
  const t0 = idx * period + 1.7 + 0.3 * Math.sin(idx * 2.1);
  return base + blip(t, t0, 0.14, 18) * 0.09;
}

function activeFriendlySignal(t: number): number {
  // Clean continuous fourier carrier with slow amplitude envelope breathing
  const env = 0.32 + 0.1 * Math.sin(t * 1.25 + 0.4);
  const base = fourierCarrier(t) * env * 0.34;
  const noise = smoothNoise(t) * 0.015 + microNoise(t) * 0.008;
  return base + noise;
}

function activeEnemySignal(t: number): number {
  // Morse packet × FM carrier
  const env = morseEnvelope(t) * 0.44;
  const base = fmCarrier(t) * env;
  const noise = smoothNoise(t) * 0.018 + microNoise(t) * 0.01;
  return base + noise;
}

// Frozen lock signature — bell curve with two side lobes, decaying exponential
function lockSignature(xNormalized: number): number {
  // xNormalized: 0..1 across the buffer (oldest→newest)
  const x = xNormalized - 0.5; // center at 0
  const d = Math.abs(x);
  return Math.cos(d * Math.PI * 4) * 0.4 * Math.exp(-d * 3.2);
}

function signalFor(state: SignalState, theme: SignalTheme, t: number): number {
  if (state === 'waiting') return waitingSignal(t);
  if (state === 'active') return theme === 'enemy' ? activeEnemySignal(t) : activeFriendlySignal(t);
  // completed uses frozen buffer instead; return 0 to be safe
  return 0;
}

export function SignalOscilloscope({
  state,
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

    // ---- Offscreen graticule ----
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

    // ---- Scrolling sample buffer ----
    // 1 sample == 1 horizontal pixel; left = older, right = newer
    const BUFFER_SIZE = Math.max(2, Math.floor(width));
    const buffer = new Float32Array(BUFFER_SIZE);

    // Seed waiting/active with a short history so it doesn't start from zero
    const seedStart = -BUFFER_SIZE / SAMPLE_RATE;
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const t = seedStart + i / SAMPLE_RATE;
      buffer[i] = state === 'completed' ? lockSignature(i / (BUFFER_SIZE - 1)) : signalFor(state, theme, t);
    }

    let sampleTime = 0;            // virtual seconds of signal pushed
    let sampleAccumulator = 0;     // fractional sample carry-over
    let startT = performance.now();
    let lastT = startT;

    const drawTrace = (ySamples: Float32Array, offsetX: number, stroke: string, lineWidth: number, blur: number) => {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = stroke;
      ctx.shadowBlur = blur;
      ctx.shadowColor = pal.shadow;
      ctx.beginPath();
      for (let i = 0; i < BUFFER_SIZE; i++) {
        const x = i + offsetX;
        const y = (ySamples[i] + 0.5) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const drawLabel = () => {
      const label = state === 'waiting' ? 'NO SIG'
        : state === 'active' ? 'TRACK'
          : 'LOCK';
      ctx.font = '7px "Courier Prime", ui-monospace, monospace';
      ctx.fillStyle = pal.label;
      ctx.textBaseline = 'top';
      ctx.fillText(label, 3, 2);
      if (state === 'completed') ctx.fillText('◉', width - 9, 2);
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

    // Reduced-motion: single static frame
    if (reducedMotion) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(grat, 0, 0, width, height);
      drawTrace(buffer, 0, pal.phosphor, 1.2, 5);
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
      const sinceStart = (now - startT) / 1000;

      if (state !== 'completed') {
        // Advance scrolling buffer with time-continuous samples
        sampleAccumulator += dt * SAMPLE_RATE;
        const advance = Math.floor(sampleAccumulator);
        sampleAccumulator -= advance;
        if (advance > 0) {
          // Shift left by `advance` positions
          if (advance < BUFFER_SIZE) {
            buffer.copyWithin(0, advance);
          }
          const n = Math.min(advance, BUFFER_SIZE);
          for (let i = 0; i < n; i++) {
            const t = sampleTime + (i + 1) / SAMPLE_RATE;
            buffer[BUFFER_SIZE - n + i] = signalFor(state, theme, t);
          }
          sampleTime += advance / SAMPLE_RATE;
        }
      }

      // Persistence — fade prior frame with theme bg at low alpha
      ctx.fillStyle = pal.bg;
      ctx.globalAlpha = state === 'completed' ? 0.6 : 0.38;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      ctx.drawImage(grat, 0, 0, width, height);

      // Dramatic intro burst when entering `completed` — one-shot spike, first 0.5s
      // Additive on top of the frozen lock signature, so we overwrite the middle
      // few buffer cells briefly.
      if (state === 'completed' && sinceStart < 0.5) {
        const k = 1 - sinceStart / 0.5;
        // overwrite a central slice with a spiky kick that decays
        for (let i = 0; i < BUFFER_SIZE; i++) {
          const x = i / (BUFFER_SIZE - 1);
          const base = lockSignature(x);
          const kick = blip(sinceStart, 0.06, 0.08, 42) * 0.9 * Math.exp(-sinceStart * 6);
          const pos = Math.exp(-Math.pow((x - 0.5) * 10, 2));
          buffer[i] = base + kick * pos * k;
        }
      }

      // Chromatic aberration — two offset faint traces, additive
      ctx.globalCompositeOperation = 'lighter';
      drawTrace(buffer, pal.aberrR, 'rgba(255,110,110,0.32)', 1, 4);
      drawTrace(buffer, pal.aberrB, 'rgba(110,190,255,0.28)', 1, 4);
      ctx.globalCompositeOperation = 'source-over';

      // Bloom
      drawTrace(buffer, 0, pal.bloom, 3, 10);
      // Core
      drawTrace(buffer, 0, pal.phosphor, 1.2, 5);
      ctx.shadowBlur = 0;

      // Active: rightmost "write head" dot (where fresh signal is being drawn)
      if (state === 'active') {
        const lastY = (buffer[BUFFER_SIZE - 1] + 0.5) * height;
        ctx.fillStyle = pal.phosphor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = pal.shadow;
        ctx.beginPath();
        ctx.arc(BUFFER_SIZE - 1, lastY, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Completed: corner brackets + playback sweep head + bottom data ticker
      if (state === 'completed' && sinceStart >= 0.5) {
        // (a) Corner lock brackets — breathing opacity, 1.2s period
        const bracketAlpha = 0.55 + 0.25 * Math.sin(sinceStart * 2 * Math.PI / 1.2);
        ctx.save();
        ctx.strokeStyle = pal.phosphor;
        ctx.globalAlpha = bracketAlpha;
        ctx.lineWidth = 1.1;
        ctx.shadowBlur = 5;
        ctx.shadowColor = pal.shadow;
        const bl = 5; // bracket arm length
        const pad = 3;
        // top-left
        ctx.beginPath();
        ctx.moveTo(pad, pad + bl);
        ctx.lineTo(pad, pad);
        ctx.lineTo(pad + bl, pad);
        // top-right
        ctx.moveTo(width - pad - bl, pad);
        ctx.lineTo(width - pad, pad);
        ctx.lineTo(width - pad, pad + bl);
        // bottom-left
        ctx.moveTo(pad, height - pad - bl);
        ctx.lineTo(pad, height - pad);
        ctx.lineTo(pad + bl, height - pad);
        // bottom-right
        ctx.moveTo(width - pad - bl, height - pad);
        ctx.lineTo(width - pad, height - pad);
        ctx.lineTo(width - pad, height - pad - bl);
        ctx.stroke();
        ctx.restore();

        // (b) Playback sweep — bright dot traces waveform L→R every 2.8s
        const SWEEP_CYCLE = 2.8;
        const SWEEP_DUR = 0.85;
        const sweepT = (sinceStart - 0.5) % SWEEP_CYCLE;
        if (sweepT < SWEEP_DUR) {
          const progress = sweepT / SWEEP_DUR;
          const idx = Math.floor(progress * (BUFFER_SIZE - 1));
          const headX = idx;
          const headY = (buffer[idx] + 0.5) * height;
          // Short trail behind the head
          ctx.save();
          ctx.strokeStyle = pal.phosphor;
          ctx.lineWidth = 1.4;
          ctx.shadowBlur = 10;
          ctx.shadowColor = pal.shadow;
          ctx.beginPath();
          const trailStart = Math.max(0, idx - 14);
          for (let i = trailStart; i <= idx; i++) {
            const y = (buffer[i] + 0.5) * height;
            if (i === trailStart) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
          }
          ctx.stroke();
          // Head dot
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(headX, headY, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // (c) Bottom data ticker — 6 pseudo-random hex chars scrolling left
        const TICKER_SPEED = 20; // px/s
        const tickerOffset = (sinceStart * TICKER_SPEED) % 24;
        // deterministic hex stream from integer bucket index
        const bucketStart = Math.floor(sinceStart * TICKER_SPEED / 24);
        const charsVisible = 12;
        ctx.save();
        ctx.font = '6px "Courier Prime", ui-monospace, monospace';
        ctx.fillStyle = pal.label;
        ctx.globalAlpha = 0.7;
        ctx.textBaseline = 'bottom';
        let hex = '';
        for (let i = 0; i < charsVisible; i++) {
          // simple hash → hex char
          const seed = (bucketStart + i) * 2654435761 >>> 0;
          const c = (seed & 0xf).toString(16).toUpperCase();
          hex += c + ((i % 2) ? ' ' : '');
        }
        ctx.fillText(hex, width - tickerOffset - 70, height - 1);
        ctx.restore();
      }

      drawLabel();
      drawOverlays();

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state, theme, width, height]);

  const ariaLabel = state === 'waiting' ? 'No signal'
    : state === 'active' ? 'Signal tracking'
      : 'Signal locked';

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

export default SignalOscilloscope;
