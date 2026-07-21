// Shared painters for the game views: guidance strip, headers with the
// countdown dial, code cards, clue boards, word strips, live monitor.

import type { GameState } from '../../store';
import type { Ctx } from '../kit';
import { countdownRing, panelTitle, phaseStrip, pips, text } from '../kit';
import { T, font } from '../theme';
import { countdownOf, PHASE_CAPTION } from '../view';

export function roleLabel(role: string): string {
  switch (role) {
    case 'encryptor':
      return '你是本回合加密者';
    case 'teammate':
      return '你是解密方（加密者队友）';
    case 'opponent':
      return '你是拦截方（敌方全员）';
    default:
      return '';
  }
}

export const MX = 168; // left margin for game-view content
export const MW = 1200; // content width

/** Guidance strip (flow + role) + action header + countdown dial. Returns
 *  the y where content may continue. */
export function header(g: Ctx, s: GameState, title: string, sub: string, alert = false): number {
  const sx = phaseStrip(g, s.phase, s.round, MX, 66);
  text(g, roleLabel(s.myRole), MX + sx + 30, 66, { size: 19, weight: 700, color: T.amber, baseline: 'middle' });
  g.strokeStyle = T.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(MX, 92);
  g.lineTo(MX + MW, 92);
  g.stroke();

  text(g, title, MX, 138, { size: 32, weight: 800, color: alert ? T.red : T.text });
  if (sub) text(g, sub, MX, 172, { size: 18, color: T.dim });

  const cd = countdownOf(s);
  if (cd) {
    countdownRing(g, MX + MW - 44, 138, 34, cd.frac, cd.secs, PHASE_CAPTION[s.phase] ?? '');
  }
  return 200;
}

/** The 3 secret code cards (digit + word). */
export function codeCards(g: Ctx, digits: number[], words: string[], title: string, y: number): number {
  panelTitle(g, title, MX, y, MW);
  const gap = 16;
  const cw = (MW - gap * 2) / 3;
  for (let i = 0; i < 3; i++) {
    const x = MX + i * (cw + gap);
    g.fillStyle = T.bgPanel;
    g.strokeStyle = T.line;
    g.lineWidth = 1;
    g.fillRect(x, y + 16, cw, 108);
    g.strokeRect(x, y + 16, cw, 108);
    text(g, String(digits[i] ?? '·'), x + cw / 2, y + 60, {
      size: 40,
      weight: 700,
      mono: true,
      color: T.amber,
      align: 'center',
    });
    text(g, words[i] ?? '—', x + cw / 2, y + 92, { size: 19, weight: 600, color: T.text, align: 'center' });
    text(g, `线索 0${i + 1}`, x + cw / 2, y + 116, { size: 13, color: T.dim, align: 'center' });
  }
  return y + 140;
}

/** Numbered clue display. */
export function clueBoard(g: Ctx, clues: string[], title: string, y: number): number {
  panelTitle(g, title, MX, y, MW);
  let cy = y + 18;
  for (let i = 0; i < 3; i++) {
    g.fillStyle = T.bgPanel;
    g.fillRect(MX, cy, MW, 44);
    g.fillStyle = T.amberDim;
    g.fillRect(MX, cy, 3, 44);
    g.fillStyle = T.amberFaint;
    g.strokeStyle = T.line;
    g.fillRect(MX + 14, cy + 9, 34, 26);
    g.strokeRect(MX + 14, cy + 9, 34, 26);
    text(g, `0${i + 1}`, MX + 31, cy + 22, { size: 15, weight: 700, mono: true, color: T.amber, align: 'center', baseline: 'middle' });
    const clue = clues[i] && clues[i].trim() !== '' ? clues[i] : '···';
    text(g, clue, MX + 62, cy + 22, { size: 24, weight: 600, color: T.amber, baseline: 'middle' });
    cy += 52;
  }
  return cy + 6;
}

/** The player's own 4 secret words. */
export function wordsStrip(g: Ctx, words: string[], y: number, title = '我方密码本'): number {
  panelTitle(g, title, MX, y, MW);
  const gap = 12;
  const cw = (MW - gap * 3) / 4;
  words.forEach((w, i) => {
    const x = MX + i * (cw + gap);
    g.fillStyle = T.bgPanel;
    g.strokeStyle = T.line;
    g.fillRect(x, y + 14, cw, 48);
    g.strokeRect(x, y + 14, cw, 48);
    g.fillStyle = T.brass;
    g.fillRect(x + 10, y + 24, 28, 28);
    text(g, String(i + 1), x + 24, y + 38, { size: 17, weight: 700, mono: true, color: '#f3ecd9', align: 'center', baseline: 'middle' });
    g.font = font(19, 600);
    const clipped = clip(g, w, cw - 60);
    text(g, clipped, x + 48, y + 38, { size: 19, weight: 600, color: T.text, baseline: 'middle' });
  });
  return y + 78;
}

export function clip(g: Ctx, s: string, maxW: number): string {
  if (g.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && g.measureText(out + '…').width > maxW) out = out.slice(0, -1);
  return out + '…';
}

const ACTION_LABEL: Record<string, string> = {
  encrypt: '编制密电',
  intercept: '拦截破译',
  decrypt: '解密核对',
};

/** Live monitor: latest other-player progress + AI status. */
export function monitor(g: Ctx, s: GameState, action: string, y: number, t: number): number {
  panelTitle(g, '实时监控', MX, y, MW);
  const p = s.progress && s.progress.action === action && s.progress.player !== s.myNickname ? s.progress : null;
  const ai = s.aiStatus && s.aiStatus.action === action ? s.aiStatus : null;
  g.fillStyle = 'rgba(8,4,2,0.45)';
  g.strokeStyle = T.line;
  g.fillRect(MX, y + 14, MW, 64);
  g.strokeRect(MX, y + 14, MW, 64);
  const cy = y + 46;
  if (ai) {
    text(g, `◈ ${ai.player}`, MX + 18, cy, { size: 18, weight: 600, color: T.amber, baseline: 'middle' });
    text(g, `${ACTION_LABEL[ai.action] ?? ai.action} ${ai.step}/${ai.total} · 通常 5–15 秒`, MX + 240, cy, {
      size: 17,
      color: T.dim,
      baseline: 'middle',
    });
  } else if (p) {
    text(g, p.player, MX + 18, cy, { size: 18, weight: 600, color: T.text, baseline: 'middle' });
    for (let i = 0; i < 3; i++) {
      const on = p.guesses ? (p.guesses[i] ?? 0) > 0 : i < p.step;
      const isFocus = p.focus === i + 1;
      g.beginPath();
      g.arc(MX + 250 + i * 26, cy, 6, 0, Math.PI * 2);
      if (isFocus && Math.floor(t * 2.4) % 2 === 0) {
        g.fillStyle = T.red;
        g.fill();
      } else if (on) {
        g.fillStyle = T.amber;
        g.fill();
      } else {
        g.strokeStyle = T.faint;
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    const stateText = p.state === 'submitted' ? '已提交' : p.state === 'editing' ? '输入中' : '待命';
    text(g, stateText, MX + 360, cy, { size: 17, color: p.state === 'submitted' ? T.amber : T.dim, baseline: 'middle' });
  } else {
    const waiting =
      action === 'encrypt'
        ? `等待 ${s.encryptor || '加密者'} 动笔…`
        : action === 'intercept'
          ? '等待拦截方落子…'
          : '等待解密方核对…';
    text(g, waiting, MX + 18, cy, { size: 17, color: T.faint, baseline: 'middle' });
  }
  return y + 92;
}

/** Score rows used on result / game-over views. */
export function scoreRow(
  g: Ctx,
  team: string,
  score: { interceptions: number; decrypt_failures: number },
  mine: boolean,
  x: number,
  y: number,
  w: number,
): void {
  g.fillStyle = T.bgPanel;
  g.strokeStyle = mine ? T.amberDim : T.line;
  g.lineWidth = mine ? 2 : 1;
  g.fillRect(x, y, w, 52);
  g.strokeRect(x, y, w, 52);
  g.fillStyle = team === 'A' ? T.teamA : T.teamB;
  g.fillRect(x + 14, y + 12, 52, 28);
  text(g, `${team} 队`, x + 40, y + 26, { size: 17, weight: 700, color: '#f3ecd9', align: 'center', baseline: 'middle' });
  text(g, '拦', x + 96, y + 26, { size: 16, color: T.dim, baseline: 'middle' });
  pips(g, x + 130, y + 26, score.interceptions, 'intercept');
  text(g, `${score.interceptions}/2`, x + 176, y + 26, { size: 16, mono: true, color: T.text, baseline: 'middle' });
  text(g, '误', x + 250, y + 26, { size: 16, color: T.dim, baseline: 'middle' });
  pips(g, x + 284, y + 26, score.decrypt_failures, 'fail');
  text(g, `${score.decrypt_failures}/2`, x + 330, y + 26, { size: 16, mono: true, color: T.text, baseline: 'middle' });
}
