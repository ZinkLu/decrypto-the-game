// Game over view: final banner, final scores, back to HQ.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { button, makeArea, panelTitle, roundRect, text } from '../kit';
import { T } from '../theme';
import { CView } from '../view';
import { MX, MW } from './shared';

export class GameOverView extends CView {
  readonly id = 'gameover';

  get animated(): boolean {
    return false;
  }

  paint(g: Ctx, s: GameState, _t: number): void {
    this.areas.length = 0;

    const winner = s.gameOver?.winner ?? null;
    const iWon = winner !== null && winner === s.myTeam;
    const main = winner === null ? T.text : iWon ? T.amber : T.red;

    // big banner
    const bannerY = 120;
    g.fillStyle = winner === null ? T.bgPanel : iWon ? 'rgba(255,180,94,0.1)' : 'rgba(255,90,60,0.1)';
    g.strokeStyle = winner === null ? T.line : iWon ? T.amberDim : T.redDim;
    g.lineWidth = 2;
    roundRect(g, MX, bannerY, MW, 170, 6);
    g.fill();
    g.stroke();
    g.save();
    if (iWon) {
      g.shadowColor = 'rgba(255,180,94,0.4)';
      g.shadowBlur = 22;
    }
    text(
      g,
      winner === null ? '平局 · 战线冻结' : iWon ? '任务达成 · 我方获胜' : '行动失败 · 敌方获胜',
      MX + MW / 2,
      bannerY + 78,
      { size: 44, weight: 800, color: main, align: 'center' },
    );
    g.restore();
    text(g, winner === null ? '16 回合耗尽，胜负未分' : `${winner} 队 赢得这场密码战`, MX + MW / 2, bannerY + 126, {
      size: 20,
      color: T.dim,
      align: 'center',
    });

    // final scores
    const scoreY = bannerY + 220;
    panelTitle(g, '最终战果', MX, scoreY, MW);
    const rows: [string, { interceptions: number; decrypt_failures: number }, boolean][] = [
      ['A', s.scoreA, s.myTeam === 'A'],
      ['B', s.scoreB, s.myTeam === 'B'],
    ];
    rows.forEach(([team, score, mine], i) => {
      const ry = scoreY + 18 + i * 64;
      g.fillStyle = T.bgPanel;
      g.strokeStyle = mine ? T.amberDim : T.line;
      g.lineWidth = mine ? 2 : 1;
      g.fillRect(MX, ry, MW, 52);
      g.strokeRect(MX, ry, MW, 52);
      g.fillStyle = team === 'A' ? T.teamA : T.teamB;
      g.fillRect(MX + 14, ry + 12, 52, 28);
      text(g, `${team} 队`, MX + 40, ry + 26, { size: 17, weight: 700, color: '#f3ecd9', align: 'center', baseline: 'middle' });
      text(g, `拦截成功 ${score.interceptions} · 解密失误 ${score.decrypt_failures}`, MX + 96, ry + 26, {
        size: 20,
        color: T.text,
        baseline: 'middle',
      });
    });

    // back to HQ
    const home = makeArea('home', MX + MW / 2 - 180, scoreY + 18 + 2 * 64 + 36, 360, 64, () => this.store.reset());
    this.areas.push(home);
    button(g, home, '返回指挥部', { primary: true, size: 24 });
  }
}
