// Intercept input view: opponents guess the digit behind each clue.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { button, makeArea, roundRect, text } from '../kit';
import { T } from '../theme';
import { CView } from '../view';
import { clueBoard, header, MX } from './shared';

export class InterceptInputView extends CView {
  readonly id = 'intercept-input';
  private guesses = [0, 0, 0];
  private focus = 1; // 1..3
  private submitted = false;
  private abort = false;

  get animated(): boolean {
    return true; // countdown
  }

  enter(_s: GameState): void {
    this.store.sendProgress('intercept', 0, { state: 'idle', guesses: [0, 0, 0] });
  }

  private get filled(): number {
    return this.guesses.filter((v) => v !== 0).length;
  }

  private emit(): void {
    this.store.sendProgress('intercept', this.filled, {
      state: 'editing',
      focus: this.focus,
      guesses: [...this.guesses],
    });
  }

  private pick(d: number): void {
    if (this.submitted) return;
    this.guesses[this.focus - 1] = d;
    // advance to the next empty slot
    for (let step = 1; step <= 3; step++) {
      const next = ((this.focus - 1 + step) % 3) + 1;
      if (this.guesses[next - 1] === 0) {
        this.focus = next;
        break;
      }
    }
    this.emit();
  }

  private clear(): void {
    if (this.submitted) return;
    this.guesses[this.focus - 1] = 0;
    this.emit();
  }

  private moveFocus(d: number): void {
    if (this.submitted) return;
    this.focus = ((this.focus - 1 + d + 3) % 3) + 1;
  }

  key(ev: KeyboardEvent): boolean {
    if (this.submitted) return false;
    if (ev.key >= '1' && ev.key <= '4') {
      this.pick(Number(ev.key));
      return true;
    }
    if (ev.key === 'Backspace') {
      this.clear();
      return true;
    }
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      this.moveFocus(ev.key === 'ArrowLeft' ? -1 : 1);
      return true;
    }
    if (ev.key === 'Enter' && this.filled === 3) {
      this.submit(false);
      return true;
    }
    return false;
  }

  private submit(abort: boolean): void {
    if (this.submitted) return;
    this.submitted = true;
    this.abort = abort;
    const guess = (abort ? [0, 0, 0] : [...this.guesses]) as [number, number, number];
    this.store.submitIntercept(guess);
    this.store.sendProgress('intercept', 3, { state: 'submitted', guesses: guess });
  }

  paint(g: Ctx, s: GameState, _t: number): void {
    this.areas.length = 0;

    const y0 = header(
      g,
      s,
      '你的回合 · 拦截破译',
      `第 ${s.round} 回合 · 对方 4 个词不可见 —— 推理每条线索对应的词位（1–4）`,
      true,
    );
    let y = clueBoard(g, s.clues, '截获的敌方线索', y0);

    // 3 big guess slots
    const slotW = 96;
    const slotH = 92;
    const slotGap = 20;
    const slotsY = y + 24;
    for (let i = 0; i < 3; i++) {
      const x = MX + i * (slotW + slotGap);
      const a = makeArea(`slot-${i}`, x, slotsY, slotW, slotH, () => {
        this.focus = i + 1;
      });
      a.enabled = !this.submitted;
      this.areas.push(a);
      const isFocus = this.focus === i + 1 && !this.submitted;
      g.fillStyle = T.slot;
      g.strokeStyle = isFocus ? T.amber : this.guesses[i] > 0 ? T.amberDim : T.line;
      g.lineWidth = isFocus ? 2.5 : 1.5;
      roundRect(g, x, slotsY, slotW, slotH, 4);
      g.fill();
      g.stroke();
      text(g, this.guesses[i] > 0 ? String(this.guesses[i]) : '·', x + slotW / 2, slotsY + slotH / 2, {
        size: 42,
        weight: 700,
        mono: true,
        color: this.guesses[i] > 0 ? T.amber : T.faint,
        align: 'center',
        baseline: 'middle',
      });
      text(g, `线索 0${i + 1}`, x + slotW / 2, slotsY + slotH + 20, { size: 14, color: T.dim, align: 'center' });
    }

    // digit keys 1-4 + clear
    const keyW = 72;
    const keyH = 68;
    const keyGap = 14;
    const keysY = slotsY + slotH + 44;
    const keys = ['1', '2', '3', '4', '✕'];
    keys.forEach((label, i) => {
      const x = MX + i * (keyW + keyGap);
      const a = makeArea(`key-${label}`, x, keysY, keyW, keyH, () => {
        if (label === '✕') this.clear();
        else this.pick(Number(label));
      });
      a.enabled = !this.submitted;
      this.areas.push(a);
      const hover = a.hovered && !this.submitted;
      g.save();
      g.globalAlpha = this.submitted ? 0.35 : 1;
      g.fillStyle = hover ? 'rgba(255,180,94,0.2)' : 'rgba(255,180,94,0.07)';
      g.strokeStyle = label === '✕' ? T.redDim : T.amberDim;
      g.lineWidth = 1.5;
      roundRect(g, x, keysY, keyW, keyH, 4);
      g.fill();
      g.stroke();
      text(g, label, x + keyW / 2, keysY + keyH / 2, {
        size: 28,
        weight: 700,
        mono: label !== '✕',
        color: label === '✕' ? T.red : T.amber,
        align: 'center',
        baseline: 'middle',
      });
      g.restore();
    });

    // echo line
    const echo = this.guesses.map((v, i) => `线索 0${i + 1} → ${v > 0 ? `第 ${v} 位` : '？'}`).join('　·　');
    text(g, echo, MX, keysY + keyH + 38, { size: 18, mono: true, color: T.dim });

    // buttons
    const btnY = keysY + keyH + 66;
    const canSubmit = !this.submitted && this.filled === 3;
    const submitBtn = makeArea('submit', MX, btnY, 280, 56, () => this.submit(false));
    submitBtn.enabled = canSubmit;
    const abortBtn = makeArea('abort', MX + 300, btnY, 220, 56, () => this.submit(true));
    abortBtn.enabled = !this.submitted;
    this.areas.push(submitBtn, abortBtn);
    button(g, submitBtn, '发出拦截', { danger: true, enabled: canSubmit });
    button(g, abortBtn, '放弃拦截', { enabled: !this.submitted });

    if (this.submitted) {
      text(g, this.abort ? '已放弃本轮拦截 · 等待判定…' : '拦截密电已发出 · 等待判定…', MX + 556, btnY + 28, {
        size: 19,
        color: T.amber,
        baseline: 'middle',
      });
    }
  }
}
