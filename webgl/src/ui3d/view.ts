// Canvas-view base class. A view paints the whole main screen and owns its
// hit areas — rebuilt every paint, so paint and hit-testing stay in sync.

import type { GameState, Store } from '../store';
import type { Ctx, HitArea } from './kit';

export abstract class CView {
  readonly areas: HitArea[] = [];

  constructor(protected readonly store: Store) {}

  abstract readonly id: string;

  /** Repaint the view. Subclasses must rebuild this.areas inside paint. */
  abstract paint(g: Ctx, s: GameState, t: number): void;

  /** True while the view animates (countdown, dots, caret) → repaint each frame. */
  get animated(): boolean {
    return false;
  }

  /** Global key handling (no IME field focused); return true if consumed. */
  key(_ev: KeyboardEvent, _s: GameState): boolean {
    return false;
  }

  enter(_s: GameState): void {}
  leave(): void {}
}

/** Server-synced countdown for the current phase, null when untimed. */
export function countdownOf(s: GameState): { frac: number; secs: number } | null {
  const total =
    s.phase === 'encrypting' ? 90 : s.phase === 'intercept' || s.phase === 'decrypt' ? 60 : 0;
  if (!total) return null;
  const remainMs = s.phaseDeadline ? s.phaseDeadline - Date.now() : total * 1000;
  return { frac: Math.max(0, Math.min(1, remainMs / (total * 1000))), secs: Math.max(0, remainMs / 1000) };
}

/** Caret blink phase for text fields. */
export function caretOn(t: number): boolean {
  return Math.floor(t * 1.8) % 2 === 0;
}

export const PHASE_CAPTION: Record<string, string> = {
  encrypting: '出题剩余',
  intercept: '拦截窗口',
  decrypt: '解密窗口',
};
