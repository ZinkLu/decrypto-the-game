// Intercept watch view: encryptor + teammates sweat it out during INTERCEPT.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { CView } from '../view';
import { clueBoard, header, monitor, wordsStrip } from './shared';

export class InterceptWatchView extends CView {
  readonly id = 'intercept-watch';

  get animated(): boolean {
    return true; // countdown + monitor focus blink
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    const y0 = header(
      g,
      s,
      `第 ${s.round} 回合 · 警报`,
      '敌方正在破译我方密电 —— 拦截成功两次我方即告失败',
      true,
    );
    let y = clueBoard(g, s.clues, '我方已发出的线索', y0);
    y = wordsStrip(g, s.myWords, y + 16);
    monitor(g, s, 'intercept', y + 16, t);
  }
}
