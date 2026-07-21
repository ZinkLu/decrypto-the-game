// Lobby view: muster point — room code, two team panels, AI slots, start.

import type { GameState } from '../../store';
import type { PlayerInfo } from '../../protocol';
import type { Ctx } from '../kit';
import { button, chip, makeArea, text, thinkingDots } from '../kit';
import { T } from '../theme';
import { CView } from '../view';

const PX = 248; // left edge of the 1040px content column
const PW = 1040;

export class LobbyView extends CView {
  readonly id = 'lobby';

  get animated(): boolean {
    const s = this.store.state;
    return !(s.myPlayerID !== '' && s.myPlayerID === s.ownerID); // waiting dots
  }

  paint(g: Ctx, s: GameState, t: number): void {
    this.areas.length = 0;

    text(g, '行动集结点', 768, 120, { size: 34, weight: 800, color: T.text, align: 'center' });

    // room code (click to copy)
    const codeArea = makeArea('code', 618, 150, 300, 70, () => {
      if (s.roomCode) {
        void navigator.clipboard?.writeText(s.roomCode).catch(() => undefined);
        this.store.showToast('频道代码已复制');
      }
    });
    this.areas.push(codeArea);
    g.save();
    g.shadowColor = 'rgba(255,180,94,0.3)';
    g.shadowBlur = 18;
    text(g, s.roomCode ?? '····', 768, 200, { size: 48, weight: 700, mono: true, color: T.amber, align: 'center' });
    g.restore();
    g.strokeStyle = T.amberDim;
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.beginPath();
    g.moveTo(618, 218);
    g.lineTo(918, 218);
    g.stroke();
    g.setLineDash([]);
    text(g, '点击复制 · 分享代码召集双方特工（每队至少 2 人）', 768, 250, { size: 17, color: T.dim, align: 'center' });

    const isOwner = s.myPlayerID !== '' && s.myPlayerID === s.ownerID;
    const myTeam = s.teamA.some((p) => p.id === s.myPlayerID)
      ? 'A'
      : s.teamB.some((p) => p.id === s.myPlayerID)
        ? 'B'
        : null;

    this.teamPanel(g, s, 'A', s.teamA, PX, 290, isOwner, myTeam);
    this.teamPanel(g, s, 'B', s.teamB, PX + PW / 2 + 16, 290, isOwner, myTeam);

    // unassigned players
    const assigned = new Set([...s.teamA, ...s.teamB].map((p) => p.id));
    const free = s.players.filter((p) => !assigned.has(p.id));
    let fy = 640;
    if (free.length > 0) {
      text(g, '待分配：', PX, fy + 18, { size: 17, color: T.dim });
      let fx = PX + 90;
      for (const p of free) {
        const w = 40 + p.nickname.length * 18 + (p.id === s.myPlayerID ? 50 : 0);
        chip(g, fx, fy, w, 36, [{ text: `${p.nickname}${p.id === s.myPlayerID ? '（我）' : ''}` }]);
        fx += w + 10;
      }
      fy += 50;
    }

    // footer
    if (isOwner) {
      const addA = makeArea('ai-a', PX + 130, fy + 16, 220, 48, () => this.store.addAI('A'));
      const addB = makeArea('ai-b', PX + 370, fy + 16, 220, 48, () => this.store.addAI('B'));
      const start = makeArea('start', PX + 610, fy + 4, 300, 66, () => this.store.startGame());
      start.enabled = s.canStart;
      this.areas.push(addA, addB, start);
      button(g, addA, '+ AI → A 队', { size: 19 });
      button(g, addB, '+ AI → B 队', { size: 19 });
      button(g, start, '开始行动', { primary: true, enabled: s.canStart, size: 24 });
      if (!s.canStart) {
        text(g, '每队至少需要 2 名成员（可添加 AI）', 768, fy + 104, { size: 16, color: T.red, align: 'center' });
      }
    } else {
      thinkingDots(g, '等待房主下达行动指令', 600, fy + 40, t);
    }
  }

  private teamPanel(
    g: Ctx,
    s: GameState,
    team: 'A' | 'B',
    members: PlayerInfo[],
    x: number,
    y: number,
    isOwner: boolean,
    myTeam: 'A' | 'B' | null,
  ): void {
    const w = PW / 2 - 16;
    const h = 320;
    const teamColor = team === 'A' ? T.teamA : T.teamB;
    g.fillStyle = T.bgPanel;
    g.strokeStyle = T.line;
    g.lineWidth = 1;
    g.fillRect(x, y, w, h);
    g.strokeRect(x, y, w, h);
    g.fillStyle = teamColor;
    g.fillRect(x, y, w, 4);

    // title row
    g.fillStyle = teamColor;
    g.fillRect(x + 16, y + 18, 52, 28);
    text(g, `${team} 队`, x + 42, y + 32, { size: 17, weight: 700, color: '#f3ecd9', align: 'center', baseline: 'middle' });
    text(g, `${members.length} 人`, x + w - 16, y + 32, { size: 16, mono: true, color: T.dim, align: 'right', baseline: 'middle' });

    // members
    let cy = y + 62;
    if (members.length === 0) {
      text(g, '虚 位 以 待', x + w / 2, cy + 70, { size: 17, color: T.faint, align: 'center' });
    }
    members.forEach((p, idx) => {
      const parts: { text: string; color?: string; badge?: string; badgeBg?: string }[] = [{ text: p.nickname }];
      if (p.is_ai) parts.push({ text: '', badge: 'AI', badgeBg: '#8a5a1e' });
      if (p.id === s.ownerID) parts.push({ text: '', badge: '房主', badgeBg: T.teamA });
      if (p.id === s.myPlayerID) parts.push({ text: '', badge: '我', badgeBg: T.stamp });
      chip(g, x + 16, cy, w - 32 - (isOwner && p.is_ai ? 40 : 0), 40, parts);
      if (isOwner && p.is_ai) {
        const rm = makeArea(`rm-${team}-${idx}`, x + w - 16 - 34, cy, 34, 40, () => this.store.removeAI(team, idx));
        this.areas.push(rm);
        text(g, '✕', rm.x + 17, cy + 20, { size: 19, weight: 700, color: T.red, align: 'center', baseline: 'middle' });
      }
      cy += 48;
    });

    const join = makeArea(
      `join-${team}`,
      x + 16,
      y + h - 58,
      w - 32,
      44,
      () => (myTeam === team ? this.store.leaveTeam() : this.store.selectTeam(team)),
    );
    this.areas.push(join);
    button(g, join, myTeam === team ? '离开该队' : '加入该队', { size: 19 });
  }
}
