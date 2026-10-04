import { translate } from './i18n';
import { originalGameLinks, guideWords, guideClues, guideHistory, guideSteps, guideLeads, guideNotes } from './guide';
import { themeColors, type LocalState } from './model';
import { CREAM, DARK, DIM, FONT, MUTED, RULE, fitLabel, line, round, text, wrap, type Painter } from './paintKit';

const guidePages = guideSteps.length;

/**
 * The field guide, one idea per page. The illustration is a text-free sprite of the
 * three agents; every label and diagram is painted here, localized, in the theme's accent.
 */
export function paintGuide(c: CanvasRenderingContext2D, u: LocalState, page: number, art?: HTMLImageElement) {
    const t = (key: string) => translate(u.locale, key);
    const colors = themeColors(u.theme);
    const accent = colors.own.light, rival = colors.opponent.light, warning = colors.warning.light;
    const label = (value: string, x: number, y: number, size = 22, max = 890, color = CREAM, weight = 500) => fitLabel(c, t(value), x, y, size, color, weight, max);
    const centred = (draw: () => void) => { c.save(); c.textAlign = 'center'; draw(); c.restore(); };
    const person = (index: number, x: number, y: number, size: number) => {
        if (art) c.drawImage(art, index * art.naturalWidth / 3, 0, art.naturalWidth / 3, art.naturalHeight, x, y, size, size);
    };
    const arrow = (x: number, y: number, ex: number, ey: number, color = accent) => {
        c.strokeStyle = color; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
        c.save(); c.translate(ex, ey); c.rotate(Math.atan2(ey - y, ex - x));
        c.beginPath(); c.moveTo(-8, -5); c.lineTo(0, 0); c.lineTo(-8, 5); c.stroke(); c.restore();
    };
    const box = (x: number, y: number, w: number, h: number, color: string, dashed = false) => {
        c.save(); c.strokeStyle = color; c.lineWidth = 1.5;
        if (dashed) c.setLineDash([5, 4]);
        round(c, x, y, w, h, 6); c.stroke(); c.restore();
    };
    // The step's number badge and name, then its idea in one sentence.
    c.fillStyle = accent;
    c.beginPath(); c.arc(72, 112, 17, 0, Math.PI * 2); c.fill();
    centred(() => text(c, String(page + 1), 72, 113, 22, DARK, 700));
    label(guideSteps[page], 100, 112, 32, 845, accent, 600);
    label(guideLeads[page], 55, 157, 21, 890, CREAM, 400);
    if (page === 0) {
        label('我方词窗', 55, 204, 17, 240, MUTED, 400);
        guideWords.forEach((value, i) => {
            const x = 55 + i * 124;
            box(x, 218, 112, 82, accent + '99');
            text(c, `0${i + 1}`, x + 12, 239, 16, accent, 600);
            label(value, x + 12, 274, 26, 90);
        });
        label('对方词窗', 55, 330, 17, 240, MUTED, 400);
        for (let i = 0; i < 4; i++) {
            const x = 55 + i * 124;
            box(x, 344, 112, 58, RULE);
            text(c, `0${i + 1}`, x + 12, 362, 16, DIM, 600);
            text(c, '• • • •', x + 12, 386, 16, DIM, 500);
        }
        wrap(c, t(guideNotes[0]), 55, 446, 500, 18, MUTED, 2);
        // The cast of every round: two of ours, and their interceptor.
        const cast = [['加密者', '写三条线索', accent], ['队友', '对照密词解码', accent], ['对手', '截获密码', rival]] as const;
        centred(() => { label('我方', 718, 202, 16, 220, MUTED, 400); label('对方', 891, 202, 16, 100, MUTED, 400); });
        line(c, 605, 216, 226, RULE); line(c, 841, 216, 100, RULE);
        cast.forEach(([name, job, color], i) => {
            const x = 601 + i * 118;
            person(i, x, 226, 108);
            centred(() => { label(name, x + 54, 352, 20, 104, color, 600); label(job, x + 54, 378, 14, 108, MUTED, 400); });
        });
    } else if (page === 1) {
        const code = [3, 1, 4];
        // Private to public, top to bottom: the drawn code, our keywords, the clues everyone hears.
        ([['密码', '仅加密者', 228], ['密词', '仅我方', 304], ['线索', '双方可见', 386]] as const).forEach(([name, who, y], row) => {
            label(name, 55, y - 10, 22, 136, row === 2 ? CREAM : accent, 600);
            label(who, 55, y + 16, 15, 136, MUTED, 400);
        });
        label('加密者抽到的密码', 214, 196, 15, 360, MUTED, 400);
        code.forEach((digit, i) => {
            const x = 214 + i * 124, middle = x + 52;
            centred(() => text(c, String(digit), middle, 230, 42, accent, 600));
            arrow(middle, 254, middle, 278);
            box(x, 284, 104, 40, accent + '80', true);
            centred(() => label(guideWords[digit - 1], middle, 304, 22, 90));
            arrow(middle, 330, middle, 356);
            box(x, 362, 104, 46, accent);
            centred(() => label(guideClues[i], middle, 385, 26, 90));
        });
        label('公开线索 · 只说词，不说编号', 214, 434, 16, 360, MUTED, 400);
        wrap(c, t(guideNotes[1]), 55, 470, 540, 18, MUTED, 1);
        person(0, 646, 190, 232);
        centred(() => label('加密者', 762, 440, 20, 230, accent, 600));
    } else if (page === 2) {
        label('前几轮的线索与答案', 55, 204, 20, 340, accent, 600);
        c.save(); c.textAlign = 'right'; label('同一队的记录', 600, 204, 15, 200, MUTED, 400); c.restore();
        label('公开线索', 112, 234, 15, 300, MUTED, 400);
        label('揭晓密码', 498, 234, 15, 102, MUTED, 400);
        guideHistory.forEach((row, i) => {
            const y = 268 + i * 42;
            text(c, `0${i + 1}`, 55, y, 18, MUTED);
            fitLabel(c, row.clues.map(t).join(' · '), 112, y, 22, CREAM, 400, 336);
            text(c, '→', 466, y, 20, MUTED);
            text(c, row.code.join('·'), 498, y, 24, accent, 600);
            line(c, 55, y + 21, 545, '#34423f');
        });
        // This round: the rivals have the public clues and the record, nothing else.
        label('对手猜', 55, 406, 16, 52, rival, 600);
        fitLabel(c, guideClues.map(t).join(' · '), 112, 406, 22, CREAM, 400, 336);
        text(c, '→', 466, 406, 20, MUTED);
        text(c, '2·1·4 ✗', 498, 406, 24, warning, 600);
        wrap(c, t(guideNotes[2]), 55, 456, 545, 18, MUTED, 2);
        person(2, 652, 190, 224);
        centred(() => label('对手', 764, 436, 20, 224, rival, 600));
    } else {
        // The team holds the keywords the rivals never saw: each clue points back to a number.
        label('公开线索', 55, 204, 15, 150, MUTED, 400);
        label('我方密词', 215, 204, 15, 150, MUTED, 400);
        label('编号', 392, 204, 15, 100, MUTED, 400);
        guideClues.forEach((clue, i) => {
            const y = 240 + i * 38, digit = [3, 1, 4][i];
            label(clue, 55, y, 24, 118);
            text(c, '→', 180, y, 20, MUTED);
            label(guideWords[digit - 1], 215, y, 24, 128);
            text(c, '→', 356, y, 20, MUTED);
            text(c, String(digit), 392, y, 26, accent, 600);
        });
        text(c, '3·1·4 ✓', 446, 278, 30, accent, 600);
        line(c, 55, 372, 545, RULE);
        label('截获 2 次 → 获胜', 55, 402, 20, 260, CREAM, 500);
        label('解码失误 2 次 → 落败', 300, 402, 20, 300, CREAM, 500);
        label(guideNotes[3], 55, 438, 17, 545, MUTED, 400);
        label('BGG 游戏介绍', 55, 474, 17, 180, MUTED, 400);
        c.font = `400 17px ${FONT}`;
        text(c, '↗', 55 + Math.min(180, c.measureText(t('BGG 游戏介绍')).width) + 8, 474, 17, MUTED);
        person(1, 652, 190, 224);
        centred(() => label('队友', 764, 436, 20, 224, accent, 600));
    }
}

/** Dots for every page, the current one lit; the keypad's 1–4 and the arrow keys turn them too. */
export function guideNav({ t, colors, button, target }: Painter, c: CanvasRenderingContext2D, page: number) {
    line(c, 55, 506, 890, RULE);
    if (page > 0) button(c, 'guide-prev', '‹  ' + t('上一步'), 55, 526, 150, 44);
    for (let i = 0; i < guidePages; i++) {
        const x = 500 + (i - (guidePages - 1) / 2) * 34;
        c.beginPath(); c.arc(x, 548, i === page ? 7 : 5, 0, Math.PI * 2);
        if (i === page) { c.fillStyle = colors.own.light; c.fill(); }
        else { c.strokeStyle = '#7d8a86'; c.lineWidth = 1.5; c.stroke(); }
        target('screen', `guide-page-${i}`, t('第 {0} 步 · {1}', [i + 1, t(guideSteps[i])]), x - 16, 532, 32, 32, { disabled: i === page });
    }
    const last = page === guidePages - 1;
    button(c, last ? 'guide-done' : 'guide-next', last ? t('完成') : t('下一步') + '  ›', 795, 526, 150, 44);
    if (last) target('screen', 'guide-bgg', t('BGG 游戏介绍'), 50, 458, 220, 32, { href: originalGameLinks[1].href });
}
