// Decrypt input view: teammates assign one of their 4 words to each clue.
// The guess digits are the word positions — the mapping is the interaction.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { button, makeArea, panelTitle, roundRect, text } from '../kit';
import { T, font } from '../theme';
import { CView } from '../view';
import { clip, header, MX, MW } from './shared';

export class DecryptInputView extends CView {
  readonly id = 'decrypt-input';
  private guesses = [0, 0, 0]; // word positions 1-4, 0 = unassigned
  private focus = 1; // row 1..3
  private submitted = false;

  get animated(): boolean {
    return true; // countdown
  }

  enter(_s: GameState): void {
    this.store.sendProgress('decrypt', 0, { state: 'idle', guesses: [0, 0, 0] });
  }

  private get filled(): number {
    return this.guesses.filter((v) => v !== 0).length;
  }

  private emit(): void {
    this.store.sendProgress('decrypt', this.filled, {
      state: 'editing',
      focus: this.focus,
      guesses: [...this.guesses],
    });
  }

  private pick(w: number): void {
    if (this.submitted) return;
    this.guesses[this.focus - 1] = w;
    // advance to the next empty row
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
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      this.moveFocus(ev.key === 'ArrowUp' ? -1 : 1);
      return true;
    }
    if (ev.key === 'Enter' && this.filled === 3) {
      this.submit();
      return true;
    }
    return false;
  }

  private submit(): void {
    if (this.submitted || this.filled < 3) return;
    this.submitted = true;
    const guess = [...this.guesses] as [number, number, number];
    this.store.submitDecrypt(guess);
    this.store.sendProgress('decrypt', 3, { state: 'submitted', guesses: guess });
  }

  paint(g: Ctx, s: GameState, _t: number): void {
    this.areas.length = 0;

    const y0 = header(
      g,
      s,
      '你的回合 · 解密核对',
      `第 ${s.round} 回合 · 给每条线索点选我方密码本中的词 —— 词位即密码`,
    );

    // assign rows
    const rowH = 58;
    const rowGap = 8;
    const rowsY = y0 + 16;
    for (let i = 0; i < 3; i++) {
      const ry = rowsY + i * (rowH + rowGap);
      const a = makeArea(`row-${i}`, MX, ry, MW, rowH, () => {
        this.focus = i + 1;
      });
      a.enabled = !this.submitted;
      this.areas.push(a);
      const isFocus = this.focus === i + 1 && !this.submitted;
      g.fillStyle = isFocus ? 'rgba(255,180,94,0.1)' : T.bgPanel;
      g.strokeStyle = isFocus ? T.amber : T.line;
      g.lineWidth = isFocus ? 2 : 1;
      roundRect(g, MX, ry, MW, rowH, 3);
      g.fill();
      g.stroke();

      g.fillStyle = T.amberFaint;
      g.strokeStyle = T.line;
      g.lineWidth = 1;
      g.fillRect(MX + 14, ry + 16, 34, 26);
      g.strokeRect(MX + 14, ry + 16, 34, 26);
      text(g, `0${i + 1}`, MX + 31, ry + 29, { size: 15, weight: 700, mono: true, color: T.amber, align: 'center', baseline: 'middle' });

      const clue = s.clues[i] && s.clues[i].trim() !== '' ? s.clues[i] : '···';
      g.font = font(22, 600);
      text(g, clip(g, clue, 520), MX + 62, ry + 29, { size: 22, weight: 600, color: T.amber, baseline: 'middle' });

      text(g, '→', MX + 640, ry + 29, { size: 22, color: T.amberDim, baseline: 'middle' });

      const sel = this.guesses[i];
      const word = sel > 0 ? (s.myWords[sel - 1] ?? '?') : '点选词汇';
      text(g, word, MX + 690, ry + 29, {
        size: 22,
        weight: sel > 0 ? 700 : 400,
        color: sel > 0 ? T.text : T.faint,
        baseline: 'middle',
      });
      if (sel > 0) {
        text(g, `词位 ${sel}`, MX + MW - 20, ry + 29, { size: 16, mono: true, color: T.dim, align: 'right', baseline: 'middle' });
      }
    }

    // word palette
    const palY = rowsY + 3 * (rowH + rowGap) + 14;
    panelTitle(g, '我方密码本 —— 点选填入当前行', MX, palY, MW);
    const gap = 12;
    const cw = (MW - gap * 3) / 4;
    const chipY = palY + 14;
    const chipH = 60;
    s.myWords.slice(0, 4).forEach((w, i) => {
      const x = MX + i * (cw + gap);
      const a = makeArea(`word-${i}`, x, chipY, cw, chipH, () => this.pick(i + 1));
      a.enabled = !this.submitted;
      this.areas.push(a);
      const hover = a.hovered && !this.submitted;
      g.save();
      g.globalAlpha = this.submitted ? 0.35 : 1;
      g.fillStyle = hover ? 'rgba(255,180,94,0.16)' : T.bgPanel;
      g.strokeStyle = hover ? T.amber : T.line;
      g.lineWidth = hover ? 2 : 1;
      roundRect(g, x, chipY, cw, chipH, 3);
      g.fill();
      g.stroke();
      g.fillStyle = T.brass;
      g.fillRect(x + 12, chipY + 16, 28, 28);
      text(g, String(i + 1), x + 26, chipY + 30, { size: 17, weight: 700, mono: true, color: '#f3ecd9', align: 'center', baseline: 'middle' });
      g.font = font(20, 600);
      text(g, clip(g, w, cw - 64), x + 52, chipY + 30, { size: 20, weight: 600, color: T.text, baseline: 'middle' });
      g.restore();
    });

    // submit
    const btnY = chipY + chipH + 26;
    const canSubmit = !this.submitted && this.filled === 3;
    const submitBtn = makeArea('submit', MX, btnY, 360, 60, () => this.submit());
    submitBtn.enabled = canSubmit;
    this.areas.push(submitBtn);
    button(g, submitBtn, '确认密码', { primary: true, enabled: canSubmit, size: 23 });

    if (this.submitted) {
      text(g, '密码已提交 · 等待核对…', MX + 396, btnY + 30, { size: 19, color: T.amber, baseline: 'middle' });
    }
  }
}
