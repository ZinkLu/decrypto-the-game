// Decrypt watch view: the encryptor knows the answer and stays silent.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { CView } from '../view';
import { clueBoard, codeCards, header, monitor } from './shared';

export class DecryptWatchView extends CView {
  readonly id = 'decrypt-watch';

  get animated(): boolean {
    return true; // countdown + monitor focus blink
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    const y0 = header(g, s, `第 ${s.round} 回合 · 队友正在解密`, '你知道答案 —— 保持沉默，静观其变');
    let y = codeCards(g, s.secretDigits, s.secretWords, '本轮密码 · 答案', y0);
    y = clueBoard(g, s.clues, '你已发出的线索', y + 16);
    monitor(g, s, 'decrypt', y + 16, t);
  }
}
