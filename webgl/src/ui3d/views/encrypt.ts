// Encrypt view: the encryptor writes one clue per secret digit.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { button, inputField, makeArea, text } from '../kit';
import { T } from '../theme';
import { ime } from '../ime';
import { CView, caretOn } from '../view';
import { codeCards, header, MX, MW } from './shared';

const MAX_LEN = 24;

export class EncryptView extends CView {
  readonly id = 'encrypt';
  private clues = ['', '', ''];
  private focus: number | null = null; // 0..2
  private submitted = false;

  get animated(): boolean {
    return true; // countdown + caret
  }

  enter(_s: GameState): void {
    this.store.sendProgress('encrypt', 0, { state: 'idle', focus: 0 });
    this.setFocus(0);
  }

  leave(): void {
    this.setFocus(null);
  }

  private filledCount(): number {
    return this.clues.filter((c) => c.trim() !== '').length;
  }

  private setFocus(f: number | null): void {
    this.focus = f;
    if (f === null || this.submitted) {
      ime.detach();
      return;
    }
    const view = this;
    ime.attach({
      get: () => view.clues[f],
      set: (v) => {
        view.clues[f] = v.slice(0, MAX_LEN);
        view.store.sendProgress('encrypt', view.filledCount(), { state: 'editing', focus: f + 1 });
      },
      onCommit: () => {
        if (f < 2) view.setFocus(f + 1);
        else view.submit();
      },
      onKey: (ev) => {
        if (ev.key === 'Tab') {
          view.setFocus((f + 1) % 3);
          return true;
        }
        if (ev.key === 'Escape') {
          view.setFocus(null);
          return true;
        }
        return false;
      },
    });
    this.store.sendProgress('encrypt', this.filledCount(), { state: 'editing', focus: f + 1 });
  }

  private submit(): void {
    if (this.submitted || this.filledCount() < 3) return;
    this.store.submitClues(this.clues.map((c) => c.trim()) as [string, string, string]);
    this.submitted = true;
    this.setFocus(null);
    this.store.sendProgress('encrypt', 3, { state: 'submitted', focus: 0 });
  }

  key(ev: KeyboardEvent): boolean {
    if (ev.key === 'Enter' && this.focus === null) {
      this.submit();
      return true;
    }
    return false;
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    const y0 = header(
      g,
      s,
      '你的回合 · 你是加密者',
      `第 ${s.round} 回合 · 为 ${s.secretDigits.join('-')} 各写一条线索：队友要懂，敌人要懵`,
    );
    let y = codeCards(g, s.secretDigits, s.secretWords, '本轮密码 · 绝密', y0);

    for (let i = 0; i < 3; i++) {
      const digit = s.secretDigits[i] ?? 0;
      const word = digit > 0 ? (s.myWords[digit - 1] ?? '?') : '?';
      const fy = y + 16 + i * 96;
      const a = makeArea(`clue-${i}`, MX, fy, MW, 56, () => this.setFocus(i));
      a.enabled = !this.submitted;
      this.areas.push(a);
      inputField(g, a, this.clues[i], {
        label: `线索 0${i + 1} → 词位 ${digit} · ${word}`,
        placeholder: '一句话暗示，别说漏嘴',
        focused: this.focus === i && !this.submitted,
        caretOn: caretOn(t),
      });
    }
    y += 16 + 2 * 96 + 56; // bottom of the last field

    const canSubmit = !this.submitted && this.filledCount() === 3;
    const submit = makeArea('submit', MX, y + 32, 360, 60, () => this.submit());
    submit.enabled = canSubmit;
    this.areas.push(submit);
    button(g, submit, '发出密电', { primary: true, enabled: canSubmit, size: 23 });

    if (this.submitted) {
      text(g, '密电已发出 · 等待频道广播…', MX + 396, y + 62, { size: 19, color: T.amber, baseline: 'middle' });
    }
  }
}
