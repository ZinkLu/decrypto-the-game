// Canvas 2D widget kit for the CRT screens. Every interactive widget both
// draws itself and registers a HitArea, so paint and hit-testing can never
// drift apart.

import { T, font } from './theme';

export interface HitArea {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  hovered: boolean;
  onClick?: () => void;
}

export type Ctx = CanvasRenderingContext2D;

export function makeArea(id: string, x: number, y: number, w: number, h: number, onClick?: () => void): HitArea {
  return { id, x, y, w, h, enabled: true, hovered: false, onClick };
}

export function hitAt(areas: HitArea[], px: number, py: number): HitArea | null {
  // last registered = topmost
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i];
    if (a.enabled && px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------

export interface TextOpts {
  size?: number;
  weight?: number;
  color?: string;
  mono?: boolean;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

export function text(g: Ctx, s: string, x: number, y: number, o: TextOpts = {}): void {
  g.fillStyle = o.color ?? T.text;
  g.font = font(o.size ?? 22, o.weight ?? 400, o.mono ?? false);
  g.textAlign = o.align ?? 'left';
  g.textBaseline = o.baseline ?? 'alphabetic';
  g.fillText(s, x, y);
}

export function measure(g: Ctx, s: string, size: number, weight = 400, mono = false): number {
  g.font = font(size, weight, mono);
  return g.measureText(s).width;
}

/** Shrink font size until the text fits maxW (like the 3D nameplate). */
export function fitText(g: Ctx, s: string, x: number, y: number, maxW: number, o: TextOpts = {}): void {
  let size = o.size ?? 22;
  while (size > 12 && measure(g, s, size, o.weight ?? 400, o.mono) > maxW) size -= 1;
  text(g, s, x, y, { ...o, size });
}

export function panelTitle(g: Ctx, s: string, x: number, y: number, w: number, color = T.dim): void {
  text(g, `▸ ${s}`, x, y, { size: 18, weight: 700, color });
  const tw = measure(g, `▸ ${s}`, 18, 700) + 14;
  g.strokeStyle = T.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + tw, y - 6);
  g.lineTo(x + w, y - 6);
  g.stroke();
}

export interface ButtonOpts {
  primary?: boolean;
  danger?: boolean;
  enabled?: boolean;
  size?: number;
}

export function button(g: Ctx, a: HitArea, label: string, o: ButtonOpts = {}): void {
  const enabled = o.enabled ?? true;
  const main = o.danger ? T.red : T.amber;
  g.save();
  g.globalAlpha = enabled ? 1 : 0.35;
  const hover = a.hovered && enabled;
  g.fillStyle = hover
    ? o.danger
      ? 'rgba(255,90,60,0.22)'
      : 'rgba(255,180,94,0.26)'
    : o.primary
      ? 'rgba(255,180,94,0.18)'
      : 'rgba(255,180,94,0.08)';
  g.strokeStyle = o.primary ? main : o.danger ? T.redDim : T.amberDim;
  g.lineWidth = o.primary ? 2 : 1.5;
  roundRect(g, a.x, a.y, a.w, a.h, 4);
  g.fill();
  g.stroke();
  text(g, label, a.x + a.w / 2, a.y + a.h / 2, {
    size: o.size ?? 22,
    weight: 700,
    color: main,
    align: 'center',
    baseline: 'middle',
  });
  g.restore();
}

export function tabBar(
  g: Ctx,
  areas: HitArea[],
  x: number,
  y: number,
  w: number,
  h: number,
  tabs: { id: string; label: string }[],
  active: string,
  onPick: (id: string) => void,
): void {
  const tw = w / tabs.length;
  g.strokeStyle = T.line;
  g.lineWidth = 1.5;
  roundRect(g, x, y, w, h, 4);
  g.stroke();
  tabs.forEach((t, i) => {
    const a = makeArea(`tab-${t.id}`, x + i * tw, y, tw, h, () => onPick(t.id));
    areas.push(a);
    const on = t.id === active;
    if (on) {
      g.fillStyle = 'rgba(255,180,94,0.16)';
      g.fillRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2);
      g.fillStyle = T.amber;
      g.fillRect(a.x + 1, a.y + a.h - 3, a.w - 2, 2);
    }
    text(g, t.label, a.x + a.w / 2, a.y + a.h / 2, {
      size: 22,
      weight: on ? 700 : 400,
      color: on ? T.amber : T.dim,
      align: 'center',
      baseline: 'middle',
    });
  });
}

export interface FieldOpts {
  label?: string;
  placeholder?: string;
  focused?: boolean;
  mono?: boolean;
  /** caret visible (blink phase) */
  caretOn?: boolean;
}

export function inputField(g: Ctx, a: HitArea, value: string, o: FieldOpts = {}): void {
  if (o.label) text(g, o.label, a.x, a.y - 10, { size: 18, color: o.focused ? T.amber : T.dim });
  g.fillStyle = T.slot;
  g.strokeStyle = o.focused ? T.amber : T.line;
  g.lineWidth = o.focused ? 2 : 1;
  roundRect(g, a.x, a.y, a.w, a.h, 3);
  g.fill();
  g.stroke();
  const pad = 14;
  const shown = value || (o.placeholder ?? '');
  text(g, shown, a.x + pad, a.y + a.h / 2, {
    size: 22,
    color: value ? T.text : T.faint,
    mono: o.mono,
    baseline: 'middle',
  });
  if (o.focused && o.caretOn) {
    const tw = Math.min(measure(g, value, 22, 400, o.mono), a.w - pad * 2 - 3);
    g.fillStyle = T.amber;
    g.fillRect(a.x + pad + tw + 3, a.y + a.h / 2 - 13, 2, 26);
  }
}

export function chip(g: Ctx, x: number, y: number, w: number, h: number, parts: { text: string; color?: string; badge?: string; badgeBg?: string }[]): void {
  g.fillStyle = T.bgPanel;
  g.strokeStyle = T.line;
  g.lineWidth = 1;
  roundRect(g, x, y, w, h, 3);
  g.fill();
  g.stroke();
  let cx = x + 12;
  for (const p of parts) {
    if (p.badge !== undefined) {
      const bw = measure(g, p.badge, 15, 700) + 12;
      g.fillStyle = p.badgeBg ?? T.brass;
      g.fillRect(cx, y + h / 2 - 11, bw, 22);
      text(g, p.badge, cx + bw / 2, y + h / 2, { size: 15, weight: 700, color: '#f3ecd9', align: 'center', baseline: 'middle' });
      cx += bw + 8;
    } else {
      text(g, p.text, cx, y + h / 2, { size: 19, weight: 600, color: p.color ?? T.text, baseline: 'middle' });
      cx += measure(g, p.text, 19, 600) + 8;
    }
  }
}

export function pips(g: Ctx, x: number, y: number, filled: number, kind: 'intercept' | 'fail'): void {
  for (let i = 0; i < 2; i++) {
    const on = i < filled;
    g.beginPath();
    g.arc(x + i * 18, y, 6, 0, Math.PI * 2);
    if (on) {
      g.fillStyle = kind === 'intercept' ? T.navy : T.red;
      g.fill();
    } else {
      g.strokeStyle = T.faint;
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
}

/** Round-flow guidance strip: 加密 → 拦截 → 解密, current step lit. */
export function phaseStrip(g: Ctx, phase: string, round: number, x: number, y: number): number {
  const steps = [
    { id: 'encrypting', label: '① 加密' },
    { id: 'intercept', label: '② 拦截' },
    { id: 'decrypt', label: '③ 解密' },
  ];
  const order = ['encrypting', 'intercept', 'decrypt'];
  const cur = order.indexOf(phase);
  let cx = x;
  steps.forEach((s, i) => {
    const skipped = s.id === 'intercept' && round < 3;
    const label = skipped ? `${s.label}(跳过)` : s.label;
    const tw = measure(g, label, 18, i === cur ? 700 : 400) + 24;
    if (i === cur) {
      g.fillStyle = T.amber;
      roundRect(g, cx, y - 16, tw, 32, 3);
      g.fill();
    }
    text(g, label, cx + tw / 2, y, {
      size: 18,
      weight: i === cur ? 700 : 400,
      color: i === cur ? '#160a05' : skipped ? T.faint : i < cur ? T.dim : T.text,
      align: 'center',
      baseline: 'middle',
    });
    cx += tw + 8;
    if (i < steps.length - 1) {
      text(g, '→', cx, y, { size: 18, color: T.amberDim, baseline: 'middle' });
      cx += 26;
    }
  });
  return cx - x;
}

/** Countdown dial: arc ring + remaining seconds. frac 0..1 (1 = full time). */
export function countdownRing(g: Ctx, cx: number, cy: number, r: number, frac: number, secs: number, caption: string): void {
  const low = secs <= 15;
  g.strokeStyle = 'rgba(243,230,207,0.15)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = low ? T.red : T.amber;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)));
  g.stroke();
  g.lineCap = 'butt';
  text(g, String(Math.max(0, Math.ceil(secs))), cx, cy + 2, {
    size: 26,
    weight: 700,
    mono: true,
    color: low ? T.red : T.text,
    align: 'center',
    baseline: 'middle',
  });
  text(g, caption, cx, cy + r + 16, { size: 14, color: T.dim, align: 'center' });
}

/** Animated "waiting" dots. t in seconds. */
export function thinkingDots(g: Ctx, s: string, x: number, y: number, t: number): void {
  text(g, s, x, y, { size: 20, color: T.dim, baseline: 'middle' });
  const tw = measure(g, s, 20);
  for (let i = 0; i < 3; i++) {
    const on = Math.floor(t * 2.2 + i) % 3 === 0;
    text(g, '·', x + tw + 10 + i * 14, y - 6, {
      size: 34,
      weight: 700,
      color: on ? T.amber : T.faint,
      baseline: 'middle',
    });
  }
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Phosphor screen background with scanline texture. */
export function screenBg(g: Ctx, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#170c05');
  grad.addColorStop(0.6, '#0e0603');
  grad.addColorStop(1, '#110704');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // faint scanlines
  g.fillStyle = 'rgba(0,0,0,0.14)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  // soft vignette
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}
