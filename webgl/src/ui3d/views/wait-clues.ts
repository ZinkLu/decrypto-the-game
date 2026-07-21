// Wait-for-clues view: teammates / opponents while the encryptor works.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { text, thinkingDots } from '../kit';
import { T } from '../theme';
import { CView } from '../view';
import { header, monitor, MX, wordsStrip } from './shared';

export class WaitCluesView extends CView {
  readonly id = 'wait-clues';

  get animated(): boolean {
    return true; // dots + monitor focus blink + countdown
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    const isOpponent = s.myRole === 'opponent';
    const sub = isOpponent
      ? s.round < 3
        ? '第 1–2 回合无拦截阶段 —— 记录每条线索，建立对方的词序假设'
        : '准备拦截：结合历史线索，推理对方的词序'
      : '线索公开后立即核对密码 —— 失误两次即告失败';
    const y0 = header(g, s, `第 ${s.round} 回合 · 加密中`, sub);

    const title = isOpponent ? `敌方加密者 ${s.encryptor} 正在出题` : `${s.encryptor} 正在编制密电`;
    text(g, title, MX, y0 + 34, { size: 26, weight: 800, color: T.amber });

    thinkingDots(g, `等待 ${s.encryptor} 发出线索`, MX, y0 + 84, t);

    let y = wordsStrip(g, s.myWords, y0 + 124);
    monitor(g, s, 'encrypt', y + 14, t);
  }
}
