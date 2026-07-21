// Paper overlay content: the codebook archive and the field manual, painted
// on the portrait paper canvas (1024×1280). Amber is unreadable on paper —
// everything here uses T.ink / T.pBrass / T.stamp.

import type { GameState } from '../../store';
import type { RoundHistoryRow } from '../../protocol';
import type { Ctx, HitArea } from '../kit';
import { makeArea, measure, text } from '../kit';
import { T, font } from '../theme';
import { clip } from './shared';

const PM = 72; // paper margin
const PW = 1024 - PM * 2; // paper content width

/** Shared paper chrome: sheet background, ruled lines, title bar, the red
 *  机密 stamp and the 阅毕 close button. Returns the y where content starts. */
function paperChrome(g: Ctx, w: number, h: number, areas: HitArea[], title: string, onClose: () => void): number {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#efe6d2');
  grad.addColorStop(0.5, '#e8dcc8');
  grad.addColorStop(1, '#d4c4a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // ruled lines
  g.fillStyle = 'rgba(90,70,35,0.1)';
  for (let y = 28; y < h; y += 28) g.fillRect(0, y, w, 1);

  // title bar
  text(g, title, PM, 92, { size: 34, weight: 800, color: T.ink });
  g.strokeStyle = T.pBrass;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(PM, 116);
  g.lineTo(PM + PW, 116);
  g.stroke();

  // red stamp, rotated -8°
  g.save();
  g.translate(w - 290, 66);
  g.rotate((-8 * Math.PI) / 180);
  g.globalAlpha = 0.85;
  g.strokeStyle = T.stamp;
  g.lineWidth = 3;
  g.strokeRect(-56, -26, 112, 52);
  text(g, '机密', 0, 1, { size: 30, weight: 800, color: T.stamp, align: 'center', baseline: 'middle' });
  g.restore();

  // close button (top right)
  const close = makeArea('paper-close', w - PM - 96, 44, 96, 48, onClose);
  areas.push(close);
  g.fillStyle = close.hovered ? 'rgba(139,101,8,0.18)' : 'transparent';
  g.strokeStyle = T.pBrass;
  g.lineWidth = 1.5;
  g.fillRect(close.x, close.y, close.w, close.h);
  g.strokeRect(close.x, close.y, close.w, close.h);
  text(g, '阅毕', close.x + close.w / 2, close.y + close.h / 2, {
    size: 20,
    weight: 700,
    color: T.pBrass,
    align: 'center',
    baseline: 'middle',
  });

  return 150;
}

function triple(digits: number[] | undefined): string {
  if (!digits || digits.length === 0) return '———';
  return [0, 1, 2].map((i) => ((digits[i] ?? 0) > 0 && (digits[i] ?? 0) <= 4 ? String(digits[i]) : '·')).join(' ');
}

/** 密码本 · 情报档案 — round history, newest first; stop when the sheet is full. */
export function paintPaperArchive(g: Ctx, w: number, h: number, areas: HitArea[], s: GameState, onClose: () => void): void {
  let y = paperChrome(g, w, h, areas, '密码本 · 情报档案', onClose);

  if (s.history.length === 0) {
    text(g, '暂无记录 —— 第一轮行动进行中', PM, y + 40, { size: 20, color: T.pBrass });
    return;
  }

  const rows = [...s.history].reverse(); // newest on top
  for (const r of rows) {
    if (y + 150 > h - 40) break; // no room for another card
    y = paintRoundCard(g, r, s, y);
  }
}

function paintRoundCard(g: Ctx, r: RoundHistoryRow, s: GameState, y: number): number {
  const mine = r.team === s.myTeam;

  // head: R{n} + team badge + marks
  text(g, `R${r.round}`, PM, y + 22, { size: 20, weight: 800, mono: true, color: T.ink });
  g.fillStyle = r.team === 'A' ? T.teamA : T.teamB;
  g.fillRect(PM + 62, y + 6, 56, 28);
  text(g, `${r.team} 队`, PM + 90, y + 20, { size: 16, weight: 700, color: '#f3ecd9', align: 'center', baseline: 'middle' });

  let mx = PM + 140;
  const intOk = Boolean(r.intercept && r.secret && r.intercept.join() === r.secret.join());
  const decOk = Boolean(r.decrypt && r.secret && r.decrypt.join() === r.secret.join());
  if (r.intercept && r.intercept.some((d) => d > 0)) {
    const label = intOk ? '拦截命中' : '拦截落空';
    text(g, `〔${label}〕`, mx, y + 22, { size: 16, weight: 700, color: intOk ? T.stamp : T.pBrass });
    mx += measure(g, `〔${label}〕`, 16, 700) + 14;
  }
  if (r.decrypt && r.decrypt.some((d) => d > 0)) {
    const label = decOk ? '解密成功' : '解密失误';
    text(g, `〔${label}〕`, mx, y + 22, { size: 16, weight: 700, color: decOk ? T.pBrass : T.stamp });
  }
  if (mine) {
    text(g, '我方', PM + PW, y + 22, { size: 15, weight: 700, color: T.pBrass, align: 'right' });
  }
  y += 40;

  // clue → digit (→ word for our own rounds)
  r.clues.forEach((c, i) => {
    g.font = font(17, 400);
    text(g, clip(g, `${i + 1}. ${c}`, 500), PM + 8, y + 18, { size: 17, color: T.ink });
    const digit = r.secret?.[i] ?? 0;
    if (digit > 0) {
      const word = mine && s.myWords[digit - 1] ? ` ${s.myWords[digit - 1]}` : '';
      g.font = font(17, 600);
      text(g, clip(g, `→ ${digit}${word}`, 300), PM + 540, y + 18, { size: 17, weight: 600, color: T.pBrass });
    } else {
      text(g, '→ ?', PM + 540, y + 18, { size: 17, color: 'rgba(42,32,24,0.45)' });
    }
    y += 26;
  });

  // 密码 / 拦截 / 解密 triples
  const codes: [string, number[] | undefined][] = [
    ['密码', r.secret],
    ['拦截', r.intercept],
    ['解密', r.decrypt],
  ];
  let cx = PM + 8;
  for (const [label, digits] of codes) {
    text(g, label, cx, y + 20, { size: 15, weight: 700, color: T.pBrass });
    text(g, triple(digits), cx + 44, y + 20, {
      size: 18,
      mono: true,
      color: digits && digits.length > 0 ? T.ink : 'rgba(42,32,24,0.45)',
    });
    cx += 220;
  }
  y += 34;

  // card separator
  g.strokeStyle = 'rgba(90,70,35,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(PM, y + 8);
  g.lineTo(PM + PW, y + 8);
  g.stroke();
  return y + 24;
}

/** 野战手册 · 怎么玩 — the three-step field manual. */
export function paintPaperManual(g: Ctx, w: number, h: number, areas: HitArea[], onClose: () => void): void {
  let y = paperChrome(g, w, h, areas, '野战手册 · 怎么玩', onClose);

  text(g, '4–8 人 · 每队至少 2 人 · 约 30 分钟 · 人手不足可用 AI 补位', PM, y + 30, { size: 18, color: T.pBrass });
  y += 78;

  const steps: [string, string][] = [
    ['① 词本', '每队 4 个秘密词汇，编号 1–4。敌方永远看不到你的词本。'],
    ['② 加密', '加密者抽到 3 位密码（如 3-1-4），为每个词位写一条线索 —— 队友要懂，敌人要懵。'],
    ['③ 拦截', '第 3 回合起，敌方可以截获线索、推理词序。拦截成功两次，或逼对方解密失误两次，即获胜。'],
  ];
  for (const [title, body] of steps) {
    text(g, title, PM, y + 26, { size: 24, weight: 800, color: T.ink });
    g.font = font(19, 400);
    text(g, clip(g, body, PW), PM, y + 62, { size: 19, color: T.ink });
    y += 104;
  }
}
