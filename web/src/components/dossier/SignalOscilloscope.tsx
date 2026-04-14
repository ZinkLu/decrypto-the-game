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

const SAMPLES = 96;

export function SignalOscilloscope({
  state,
  theme,
  width = 96,
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

    // ---- Offscreen graticule (drawn once, reused each frame) ----
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
      // center crosshair ticks
      gctx.strokeStyle = pal.gridAxis;
      gctx.lineWidth = 0.8;
      gctx.beginPath();
      gctx.moveTo(width / 2 - 3, height / 2);
      gctx.lineTo(width / 2 + 3, height / 2);
      gctx.moveTo(width / 2, height / 2 - 3);
      gctx.lineTo(width / 2, height / 2 + 3);
      gctx.stroke();
    }

    // ---- Frozen "captured" waveform signature ----
    const frozen = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const x = i / (SAMPLES - 1);
      const d = Math.abs(x - 0.5);
      frozen[i] = Math.cos(d * Math.PI * 4) * 0.4 * Math.exp(-d * 3.6);
    }

    let startT = performance.now();
    let lastBlipAt = startT;
    let idleBlipX = 0;

    const sampleAt = (i: number, t: number): number => {
      const x = i / (SAMPLES - 1);
      const time = t / 1000;
      if (state === 'waiting') {
        const noise = (Math.random() - 0.5) * 0.035;
        const dx = x - (0.5 + idleBlipX);
        const blip = Math.exp(-Math.pow(dx * 20, 2)) * 0.11 * Math.sin(time * 14);
        return 0.5 + noise + blip;
      }
      if (state === 'active') {
        const packet = (time * 1.4) % 1;
        const envelope = packet < 0.55
          ? Math.pow(Math.sin((packet / 0.55) * Math.PI), 0.65) * 0.4
          : 0.015 + Math.random() * 0.02;
        const carrierA = Math.sin((time * 22 + x * 10) * Math.PI * 2);
        const carrierB = Math.sin((time * 53 + x * 22) * Math.PI * 2) * 0.45;
        const mod = Math.sin((time * 3 + x * 5) * Math.PI) * 0.12;
        const noise = (Math.random() - 0.5) * 0.05;
        return 0.5 + envelope * (carrierA + carrierB) + mod + noise;
      }
      const breath = Math.sin(time * 2 + x * Math.PI) * 0.012;
      return 0.5 + frozen[i] + breath;
    };

    const drawTrace = (offsetX: number, stroke: string, lineWidth: number, blur: number, samples: Float32Array) => {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = stroke;
      ctx.shadowBlur = blur;
      ctx.shadowColor = pal.shadow;
      ctx.beginPath();
      for (let i = 0; i < SAMPLES; i++) {
        const x = (i / (SAMPLES - 1)) * width + offsetX;
        const y = samples[i] * height;
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
      // horizontal scanlines 2px stride
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#000';
      for (let y = 0; y < height; y += 2) ctx.fillRect(0, y, width, 1);
      ctx.globalAlpha = 1;
      // vignette
      const vg = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 1.25);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);
    };

    // ---- Reduced-motion: single frame ----
    if (reducedMotion) {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(grat, 0, 0, width, height);
      const samp = new Float32Array(SAMPLES);
      for (let i = 0; i < SAMPLES; i++) samp[i] = sampleAt(i, 1000);
      drawTrace(0, pal.phosphor, 1.2, 5, samp);
      ctx.shadowBlur = 0;
      drawLabel();
      drawOverlays();
      return;
    }

    // initial fill to bg
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    const samplesBuf = new Float32Array(SAMPLES);

    const render = (now: number) => {
      const t = now - startT;

      if (state === 'waiting' && now - lastBlipAt > 1600 + Math.random() * 1700) {
        idleBlipX = (Math.random() - 0.5) * 0.7;
        lastBlipAt = now;
      }

      // Persistence — fade prior frame with theme bg at low alpha
      ctx.fillStyle = pal.bg;
      ctx.globalAlpha = state === 'completed' ? 0.55 : 0.32;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      ctx.drawImage(grat, 0, 0, width, height);

      for (let i = 0; i < SAMPLES; i++) samplesBuf[i] = sampleAt(i, t);

      // Chromatic aberration — two offset faint traces, additive
      ctx.globalCompositeOperation = 'lighter';
      drawTrace(pal.aberrR, 'rgba(255,110,110,0.32)', 1, 4, samplesBuf);
      drawTrace(pal.aberrB, 'rgba(110,190,255,0.28)', 1, 4, samplesBuf);
      ctx.globalCompositeOperation = 'source-over';

      // Bloom (fat translucent)
      drawTrace(0, pal.bloom, 3, 10, samplesBuf);
      // Core (thin bright)
      drawTrace(0, pal.phosphor, 1.2, 5, samplesBuf);
      ctx.shadowBlur = 0;

      // Active: scan beam
      if (state === 'active') {
        const sx = ((t / 900) % 1) * (width + 18) - 10;
        const grad = ctx.createLinearGradient(sx - 14, 0, sx + 2, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.65, 'rgba(255,255,255,0.04)');
        grad.addColorStop(1, pal.bloom);
        ctx.fillStyle = grad;
        ctx.fillRect(sx - 14, 0, 16, height);
      }

      // Completed: pulsing lock ring at center
      if (state === 'completed') {
        const cx = width / 2;
        const cy = height / 2;
        const r = 5 + Math.sin(t / 380) * 1.3;
        ctx.strokeStyle = pal.phosphor;
        ctx.lineWidth = 0.8;
        ctx.shadowBlur = 6;
        ctx.shadowColor = pal.shadow;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
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
