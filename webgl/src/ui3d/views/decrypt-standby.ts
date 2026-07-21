// Post-intercept standby view: opponents wait for the decrypt verdict.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { thinkingDots } from '../kit';
import { CView } from '../view';
import { clueBoard, header, monitor, MX } from './shared';

export class DecryptStandbyView extends CView {
  readonly id = 'decrypt-standby';

  get animated(): boolean {
    return true; // countdown + dots + monitor focus blink
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    const y0 = header(
      g,
      s,
      `第 ${s.round} 回合 · 待命`,
      '我方拦截判定完毕 —— 等待对方解密结果（对方失误两次则我方获胜）',
    );
    let y = clueBoard(g, s.clues, '敌方的线索', y0);
    thinkingDots(g, '监听对方解密频道', MX, y + 40, t);
    monitor(g, s, 'decrypt', y + 76, t);
  }
}
