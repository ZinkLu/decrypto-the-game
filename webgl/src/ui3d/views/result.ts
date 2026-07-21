// Round result view: incremental intercept / decrypt verdicts + scores.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { roundRect, text } from '../kit';
import { T } from '../theme';
import { CView } from '../view';
import { clueBoard, codeCards, header, MX, MW, scoreRow } from './shared';

export class ResultView extends CView {
  readonly id = 'result';

  get animated(): boolean {
    return true; // blinking "next phase" hint
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    const y0 = header(g, s, `第 ${s.round} 回合 · 回合结算`, '');
    const r = s.result;
    if (!r) return;
    const iAmOpponent = s.myRole === 'opponent';
    let y = y0 + 8;

    if (r.interceptSuccess !== undefined) {
      const goodForMe = r.interceptSuccess === iAmOpponent;
      y = this.banner(
        g,
        y,
        r.interceptSuccess ? '拦截成功' : '拦截失败',
        r.interceptSuccess ? '密电被破译 —— 拦截方计一分' : '防线守住了 —— 进入解密阶段',
        goodForMe,
      );
    }
    if (r.decryptSuccess !== undefined) {
      const goodForMe = r.decryptSuccess !== iAmOpponent;
      y = this.banner(
        g,
        y,
        r.decryptSuccess ? '解密成功' : '解密失败',
        r.decryptSuccess ? '密码核对无误' : '解密方失误计数 +1 —— 两次失误即告失败',
        goodForMe,
      );
    }

    y = clueBoard(g, s.clues, '本轮线索', y + 10);
    if (s.secretDigits.length === 3 && s.secretDigits.some((d) => d > 0)) {
      y = codeCards(g, s.secretDigits, s.secretWords, '本轮密码', y + 12);
    } else {
      text(g, '本轮密码将随后归档公开', MX, y + 34, { size: 17, color: T.dim });
      y += 56;
    }

    scoreRow(g, 'A', s.scoreA, s.myTeam === 'A', MX, y + 12, MW);
    scoreRow(g, 'B', s.scoreB, s.myTeam === 'B', MX, y + 76, MW);

    // blinking "next phase" hint
    g.save();
    g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.4));
    text(g, '下一阶段即将开始…', MX + MW / 2, y + 160, { size: 19, color: T.amber, align: 'center' });
    g.restore();
  }

  private banner(g: Ctx, y: number, title: string, sub: string, goodForMe: boolean): number {
    const main = goodForMe ? T.amber : T.red;
    g.fillStyle = goodForMe ? 'rgba(255,180,94,0.08)' : 'rgba(255,90,60,0.08)';
    g.strokeStyle = goodForMe ? T.amberDim : T.redDim;
    g.lineWidth = 1.5;
    roundRect(g, MX, y, MW, 80, 4);
    g.fill();
    g.stroke();
    g.fillStyle = main;
    g.fillRect(MX, y, 4, 80);
    text(g, title, MX + 28, y + 34, { size: 26, weight: 800, color: main });
    text(g, sub, MX + 28, y + 62, { size: 17, color: T.dim });
    return y + 92;
  }
}
