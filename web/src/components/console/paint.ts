import { translate, localizeError } from './i18n';
import { originalGameLinks, guideWords, guideClues, guideHistory, guideSteps, guideOutcome, guideOpening, gameIntroduction } from './guide';
import { dotGrid, dotText, dotType, dotWordLayout } from './dotMatrix';
import { consoleHardware, hardwareMessage, roleState, diskInscription, keyDiskReadable, keyDiskIdentity, keyDiskMessage, phaseSignal, teamPalette, themeColors, rosterTeams, word, resultTint, archiveRows, scopeModes, scopeWaveBlend, scopeTimebase, scopeRatio, scopeSweepHz, scopeAxisAngle, scopeFigures } from './model';
import type { LocalState, StationState } from './model';
import { paperHeadReserve, paperTextureLength, paperLengthForRecords, paperTextureHeight } from './mechanics';
export interface Target {
    id: string;
    label: string;
    surface: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind?: 'input';
    href?: string;
    input?: { fontSize: number; padding: number; placeholder: string };
    value?: string;
    maxLength?: number;
    disabled?: boolean;
}
export interface Frame {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
}
export interface Content {
    frames: Record<string, Frame>;
    targets: Target[];
    status: string;
    connected: boolean;
    trafficKey: string;
    tint: string;
    waiting: boolean;
    ready: boolean;
    scoreFlags: Record<string, boolean>;
    seats: Record<string, string | null>;
    activity: number;
    roomCode: string;
    paperRecords: number;
    paletteKey: string;
    teamPlates: Record<'A' | 'B', string>;
    wordTube: { background: string; light: string; rim: string };
    displayKey: string;
    /** LED die colours of the keyword windows: the keyword itself, and its legends. */
    wordInks: { word: string; legend: string; warning: string };
    wordPrivacyKey: string;
    screenPrivacyKey: string;
}
const INK = '#2f2b25', CREAM = '#ece0c4', MUTED = '#a59e8c', DARK = '#111e24';
const FONT = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 10) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
}
function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, size = 26, color = CREAM, weight = 400, max?: number) {
    c.fillStyle = color;
    c.font = `${weight} ${size}px ${FONT}`;
    c.textBaseline = 'middle';
    if (max) {
        let shown = value;
        while (shown.length > 1 && c.measureText(shown).width > max)
            shown = shown.slice(0, -2) + '…';
        c.fillText(shown, x, y);
    }
    else
        c.fillText(value, x, y);
}
function fitLabel(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, weight = 400, max = Infinity) {
    c.font = `${weight} ${size}px ${FONT}`;
    const fitted = Math.min(size, size * max / Math.max(1, c.measureText(value).width));
    text(c, value, x, y, fitted, color, weight);
}
function keyword(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, color: string) {
    // Both languages start at 60 px. Long phrases wrap at word boundaries;
    // only content that does not fit shrinks, and secret words are never elided.
    const base = 60;
    c.font = `600 ${base}px ${FONT}`;
    if (c.measureText(value).width <= width) {
        text(c, value, x, y, base, color, 600);
        return;
    }
    const tokens = value.trim().split(/\s+/);
    if (tokens.length > 1) {
        let lines = [value], widest = Infinity;
        for (let split = 1; split < tokens.length; split++) {
            const candidate = [tokens.slice(0, split).join(' '), tokens.slice(split).join(' ')];
            const measured = Math.max(...candidate.map(line => c.measureText(line).width));
            if (measured < widest) { widest = measured; lines = candidate; }
        }
        const size = Math.min(48, base * width / widest);
        lines.forEach((line, i) => text(c, line, x, y + (i - .5) * size * 1.08, size, color, 600));
    } else fitLabel(c, value, x, y, base, color, 600, width);
}
function wrap(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 22, color = CREAM, maxLines = 3) {
    c.font = `400 ${size}px ${FONT}`;
    // Keep Latin words intact while allowing Chinese to wrap between characters.
    const tokens = value.match(/\n|[^\S\n]+|[\p{Script=Latin}\d][\p{Script=Latin}\d’'.,;:!?/-]*|./gu) || [];
    let row = '', count = 0;
    for (const token of tokens) {
        if (token === '\n' || row && c.measureText(row + token).width > width) {
            text(c, row.trimEnd(), x, y + count * size * 1.55, size, color);
            if (++count >= maxLines) return;
            row = '';
        }
        if (token !== '\n' && (row || token.trim())) row += token;
    }
    if (row) text(c, row.trimEnd(), x, y + count * size * 1.55, size, color);
}

function line(c: CanvasRenderingContext2D, x: number, y: number, w: number, color = '#596269') {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.stroke();
}
/** The illustration is a text-free sprite; diagrams and all copy stay localized. */
function paintGuide(c: CanvasRenderingContext2D, u: LocalState, art?: HTMLImageElement) {
    const t = (key: string) => translate(u.locale, key);
    const accent = themeColors(u.theme).own.light;
    const label = (value: string, x: number, y: number, size = 22, max = 890, color = CREAM) => fitLabel(c, t(value), x, y, size, color, 500, max);
    const step = (index: number, x: number, y: number, width: number) => {
        c.save();
        c.fillStyle = accent;
        c.beginPath(); c.arc(x + 15, y, 15, 0, Math.PI * 2); c.fill();
        c.textAlign = 'center';
        text(c, String(index + 1), x + 15, y + 1, 21, DARK, 700);
        c.restore();
        label(guideSteps[index], x + 42, y, 23, width - 42, accent);
    };
    const personSize = 140;
    const person = (index: number, x: number, y: number) => {
        if (art) c.drawImage(art, index * art.naturalWidth / 3, 0, art.naturalWidth / 3, art.naturalHeight, x, y, personSize, personSize);
    };
    const arrow = (x: number, y: number, ex: number, ey: number) => {
        c.strokeStyle = accent; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
        c.save(); c.translate(ex, ey); c.rotate(Math.atan2(ey - y, ex - x));
        c.beginPath(); c.moveTo(-10, -6); c.lineTo(0, 0); c.lineTo(-10, 6); c.stroke(); c.restore();
    };
    // The working diagram owns the space below the small CRT navigation.
    const left = 72, cluesLeft = 376, right = 712;
    step(0, left, 104, 280);
    guideWords.forEach((value, i) => {
        const x = left + i * 72;
        c.strokeStyle = '#65726e'; c.lineWidth = 1;
        round(c, x, 136, 66, 64, 4); c.stroke();
        text(c, String(i + 1), x + 8, 152, 18, accent, 600);
        label(value, x + 8, 180, 22, 50);
    });
    person(0, 200, 208);
    label('加密者', 92, 272, 22, 100, accent);
    arrow(344, 260, 364, 244);

    step(1, cluesLeft, 104, 284);
    label('加密者抽到的密码', cluesLeft, 140, 18, 284, MUTED);
    c.strokeStyle = accent; c.lineWidth = 1.5;
    round(c, cluesLeft, 208, 280, 72, 16); c.stroke();
    guideClues.forEach((value, i) => {
        const x = cluesLeft + 20 + i * 88;
        text(c, String([3, 1, 4][i]), x + 16, 176, 32, accent, 600);
        arrow(x + 22, 196, x + 22, 220);
        label(value, x, 244, 28, 80);
    });
    label('公开线索 · 只说词，不说编号', cluesLeft, 304, 18, 284, MUTED);
    label('三个编号，顺序全对才成功。', cluesLeft, 332, 18, 284, MUTED);
    arrow(672, 236, 700, 212);
    c.beginPath(); c.moveTo(672, 264); c.lineTo(688, 264); c.lineTo(688, 428); c.stroke();
    arrow(688, 428, 704, 428);

    step(2, right, 104, 232);
    person(2, right, 136);
    label('看公开线索与旧记录', right, 296, 20, 232, MUTED);
    text(c, '2·1·4 ×', 856, 212, 21, MUTED, 500);
    step(3, right, 344, 232);
    person(1, right, 368);
    label('对照我方密词解码', right, 528, 20, 232, MUTED);
    text(c, '3·1·4 ✓', 856, 440, 21, accent, 600);

    // A separate, wider history table makes each full transmission comparable.
    label('前几轮的线索与答案', left, 360, 24, 416, accent);
    label('同一队的记录', 520, 360, 18, 148, MUTED);
    label('公开线索', 128, 388, 16, 392, MUTED);
    label('揭晓密码', 584, 388, 16, 84, MUTED);
    guideHistory.forEach((row, i) => {
        const y = 420 + i * 44;
        text(c, `0${i + 1}`, left, y, 20, MUTED);
        fitLabel(c, row.clues.map(t).join(' · '), 128, y, 24, CREAM, 400, 392);
        text(c, '→', 544, y, 22, MUTED);
        text(c, row.code.join('·'), 584, y, 26, accent, 600);
        if (i < guideHistory.length - 1) line(c, left, y + 22, 596, '#34423f');
    });

    line(c, left, 548, 872, '#3b4b4d');
    label(guideOutcome, left, 568, 18, 400, MUTED);
    label(guideOpening, 492, 568, 17, 232, MUTED);
    label('BGG 游戏介绍', 771, 568, 18, 157, MUTED);
    text(c, '↗', 929, 568, 18, MUTED);
}

// Seven separate phosphor bars per cell, including faint unlit segments.
// The numerals are geometry, so their appearance does not depend on a font.
function segmentDigit(c: CanvasRenderingContext2D, value: string, x: number, y: number, color: string) {
    const bars: Record<string, number[][]> = {
        a: [[11,0],[61,0],[68,7],[61,14],[11,14],[4,7]],
        b: [[65,11],[72,18],[72,53],[65,60],[58,53],[58,18]],
        c: [[65,68],[72,75],[72,110],[65,117],[58,110],[58,75]],
        d: [[11,114],[61,114],[68,121],[61,128],[11,128],[4,121]],
        e: [[7,68],[14,75],[14,110],[7,117],[0,110],[0,75]],
        f: [[7,11],[14,18],[14,53],[7,60],[0,53],[0,18]],
        g: [[11,57],[61,57],[68,64],[61,71],[11,71],[4,64]],
    };
    const digits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
    const lit = value === '-' ? 'g' : digits[Number(value)] ?? '';
    c.save(); c.translate(x, y); c.scale(1.18, 1);
    for (const [name, points] of Object.entries(bars)) {
        const on = lit.includes(name);
        c.fillStyle = on ? color : '#302a1d';
        c.shadowColor = color; c.shadowBlur = on ? 4 : 0;
        c.beginPath();
        points.forEach(([px, py], index) => index ? c.lineTo(px, py) : c.moveTo(px, py));
        c.closePath(); c.fill();
    }
    c.restore();
}
// Static phosphor falloff; the shared GPU shader draws the raster and halation.
export function crtFinish(c: CanvasRenderingContext2D, width: number, height: number, ruby = false) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    // The shader owns the raster so it can integrate scan rows at the actual
    // projected pixel size. Baking a second grid here made distant text muddy.
    const vignette = c.createRadialGradient(width * .5, height * .5, width * .10, width * .5, height * .5, width * .68);
    vignette.addColorStop(0, ruby ? 'rgba(4, 0, 0, 0)' : 'rgba(0, 4, 2, 0)');
    vignette.addColorStop(.65, 'rgba(0, 4, 2, .035)');
    vignette.addColorStop(1, 'rgba(0, 4, 2, .50)');
    c.fillStyle = vignette; c.fillRect(0, 0, width, height);
    // Glass reflections belong to the scene lights, never to the raster.
    c.restore();
}
export function knobLabel(id: string, u: LocalState) {
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    if (id === 'scope-tune') return t('信号频率 {0} Hz · Y:X {1}', [scopeFigures(scopeRatio(u.scopeFreq) * scopeSweepHz(u.scopeRate)), scopeRatio(u.scopeFreq).toFixed(3)]);
    if (id === 'scope-wave') {
        const blend = scopeWaveBlend(u.scopeWave);
        return blend.mix ? t('波形 · {0} → {1} {2}%', [t(scopeModes[blend.from]), t(scopeModes[blend.to]), Math.round(blend.mix * 100)]) : t('波形 · {0}', [t(scopeModes[blend.from])]);
    }
    if (id === 'scope-rate') return t('扫描时基 {0} ms/格', [scopeFigures(scopeTimebase(u.scopeRate) * 1000)]);
    if (id === 'scope-xy') {
        const turned = Math.round(scopeAxisAngle(u.scopeAxis) * 180 / Math.PI);
        return turned <= 0 ? t('水平偏转 · 时基扫描') : turned >= 90 ? t('水平偏转 · X-Y') : t('水平偏转 · 转向 X-Y {0}°', [turned]);
    }
    const instrumentLabels = {
        original: [t("调整 VU 表摆动幅度"), t("调整 VU 表摆动频率")],
        signal: [u.instrumentDemo ? t("转动调谐旋钮，切回手动调谐") : t("调谐模拟频道，刻度 {0} / 100", [Number((u.meterAmplitude * 2.5).toFixed(1))]), t("调整接收增益")],
        tuning: [t("调整调谐频率，中央为第五档"), t("微调中央归零表")],
        status: [t("切换机械状态，{0}", [[t("READY 就绪"), t("SEND 发送"), t("WAIT 等待")][u.meterAmplitude]]), t("调整转鼓演示停留时间")],
    }[u.instrumentVariant];
    const amplitude = id === 'meter-amplitude';
    const label = instrumentLabels[amplitude ? 0 : 1];
    return u.instrumentVariant === 'signal' && amplitude ? label : `${label} · ${(amplitude ? u.meterAmplitude : u.meterRate).toFixed(2)}`;
}

/** Restrained wear belongs to the lip and silk-screen, never a blanket grunge layer. */
function plateWear(c: CanvasRenderingContext2D, width: number, height: number) {
    c.save();
    c.strokeStyle = '#e3dcc085'; c.lineWidth = .8;
    c.beginPath(); c.moveTo(5, 1.2); c.lineTo(width - 8, 1.2); c.stroke();
    c.strokeStyle = '#2a262066';
    c.beginPath(); c.moveTo(6, height - 1.2); c.lineTo(width - 5, height - 1.2); c.stroke();
    // Regular witness dashes along the lip read as a texture seam, not wear.
    c.restore();
}
function printWear(c: CanvasRenderingContext2D, width: number, height: number) {
    c.save(); c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#00000026';
    for (let i = 0; i < 240; i++)
        c.fillRect((i * 73.31) % width, (i * 31.71) % height, .6 + i % 3 * .25, .45);
    c.restore();
}

export function paint(s: StationState, u: LocalState, inspection = false, guideArt?: HTMLImageElement): Content {
    const h = consoleHardware(u, s);
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    const colors = themeColors(u.theme);
    const frames: Record<string, Frame> = {};
    const targets: Target[] = [];
    const r = roleState(s, u);
    const diskReadable = keyDiskReadable(s, u);
    const ownsDisk = !!keyDiskIdentity(s);
    const diskCurrent = ownsDisk && u.keyDisk.id === keyDiskIdentity(s);
    const signal = phaseSignal(s, u.theme);
    const teams = rosterTeams(s, u);
    const hasGame = !['home', 'room'].includes(s.phase);
    const waiting = hasGame && !r.active && !['round_result', 'game_over'].includes(s.phase);
    // Action colors always identify the acting side, even while this player waits.
    // Phase is already conveyed by the title and the position of the lit lamp.
    const tint = ['round_result', 'game_over'].includes(s.phase) ? resultTint(s) : signal.actingTeam ? signal.color : themeColors(u.theme).own.light;
    function frame(name: string, width: number, height: number, background?: string) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const c = canvas.getContext('2d')!;
        if (background) {
            c.fillStyle = background;
            // The curved mesh owns the CRT silhouette. Transparent texture
            // corners become holes when the barrel warp samples past them.
            if (name === 'screen' || name.startsWith('word')) c.fillRect(0, 0, width, height);
            else { round(c, 0, 0, width, height, 12); c.fill(); }
        }
        frames[name] = { canvas, width, height };
        return c;
    }
    function target(surface: string, id: string, label: string, x: number, y: number, w: number, h: number, options: Partial<Target> = {}) {
        targets.push({ surface, id, label, x, y, w, h, ...options });
        if (inspection && u.focus === id && !options.disabled && !surface.endsWith('Control')) {
            const c = frames[surface].canvas.getContext('2d')!;
            c.strokeStyle = tint;
            c.lineWidth = 3;
            round(c, x + 2, y + 2, w - 4, h - 4, 8);
            c.stroke();
        }
    }
    function button(c: CanvasRenderingContext2D, id: string, label: string, x: number, y: number, w: number, h = 52, disabled = false, selected = false) {
        c.fillStyle = selected ? '#344a51' : '#1e3036';
        round(c, x, y, w, h, 8);
        c.fill();
        text(c, label, x + 18, y + h / 2, 22, disabled ? '#66716e' : selected ? tint : CREAM, 500, w - 30);
        target('screen', id, label, x, y, w, h, { disabled });
    }
    const c = frame('screen', 1400, 830, DARK);
    // Draw in 1000 logical units; this keeps Chinese crisp without tiny GPU text.
    c.scale(1.4, 1.4);
    frames.screen.width = 1000;
    frames.screen.height = 830 / 1.4;
    const w = 1000;
    const right = w - 55;
    const status = (s.error ? localizeError(u.locale, s.error) : s.aiNotice ? t(s.aiNotice) : '') || (u.note ? t(u.note) : '') || (u.submitted ? t("密报已发送，等待服务器确认。") : '');
    const helpPage = u.manual || u.about;
    text(c, u.manual ? t('一图读懂') : u.about ? t('原版桌游') : hasGame ? t('第 {0} 回合', [String(s.round).padStart(2, '0')]) : 'DECRYPTO', 55, 49, 19, tint, 500);
    const navX = right - (h.batteryPercent === null ? 112 : 265);
    button(c, helpPage ? 'screen-close' : 'manual', helpPage ? t('返回') : t('玩法'), navX, 27, 112, 44);
    let foot = '';
    const heading = (title: string, sub = '') => {
        fitLabel(c, title, 55, 127, 43, CREAM, 600, 890);
        if (sub) fitLabel(c, sub, 55, 180, 22, MUTED, 400, 890);
    };
    const underline = (y: number, active = false) => line(c, 55, y, 890, active ? tint : '#3b4b4d');
    if (u.manual) {
        paintGuide(c, u, guideArt);
        // The source stays attached to the explanation without another slide.
        target('screen', 'guide-bgg', t('BGG 游戏介绍'), 725, 545, 220, 34, { href: originalGameLinks[1].href });
    } else if (u.about) {
        heading(t('每条线索，都是一次试探。'), 'DECRYPTO · Le Scorpion Masqué');
        wrap(c, t(gameIntroduction), 55, 253, 865, 29, CREAM, 3);
        originalGameLinks.forEach((link, i) => {
            const x = 55 + i * 303;
            button(c, 'about-' + link.id, t(link.label) + ' ↗', x, 393, 284, 62);
            targets[targets.length - 1].href = link.href;
        });
        button(c, 'manual', t('一图读懂玩法') + ' →', 55, 478, 270, 46);
        foot = t('非官方线上改编 · 喜欢这场交锋，也请支持原版。');
    } else if (s.phase === 'home') {
        heading(t('接通你的秘密频道。'));
        ['create', 'join'].forEach((mode, i) => {
            const x = 55 + i * 222, active = u.mode === mode;
            text(c, t(mode === 'create' ? '建立频道' : '加入频道'), x, 213, 25, active ? tint : MUTED, 500);
            if (active) line(c, x, 243, 182, tint);
            target('screen', 'mode-' + mode, t(mode === 'create' ? '建立频道' : '加入频道'), x, 190, 192, 56);
        });
        field('name', u.name, t('输入你的昵称'), 55, 283, 890, 74, 20);
        if (u.mode === 'join') field('code', u.code, t('四位频道编号'), 55, 403, 890, 74, 4);
        else text(c, t('4–8 位玩家 · 支持 AI 队友'), 55, 430, 25, MUTED);
        foot = t(u.mode === 'join' ? '填好代号与频道编号，按 ACTION 加入。' : '填好代号，按 ACTION 建立频道。');
    } else if (s.phase === 'room') {
        heading(t('选一队，准备开场。'), t('每队至少两人，可以由 AI 补位。'));
        const owner = s.ownerID === s.myPlayerID;
        ['A', 'B'].forEach((team, j) => {
            const x = 55 + j * 466, people = team === 'A' ? s.teamA : s.teamB;
            const joined = people.some(p => p.id === s.myPlayerID), color = teamPalette(team, s.myTeam, u.theme).light;
            text(c, t('{0} 队', [team]), x, 260, 34, color, 600);
            text(c, `${people.length} / 4`, x + 307, 260, 23, MUTED);
            for (let i = 0; i < 4; i++) {
                const p = people[i], left = x + i * 101;
                line(c, left, 343, 82, p ? color : '#3b4b4d');
                text(c, p ? p.is_ai ? 'AI' : p.id === s.myPlayerID ? t('你') : t('真人') : '—', left + 10, 314, 23, p ? CREAM : MUTED);
                if (owner && p?.is_ai) {
                    text(c, '×', left + 60, 308, 20, MUTED);
                    target('screen', `remove-${team}-${i}`, t('移除 {0}', [p.nickname]), left, 286, 84, 62);
                }
            }
            button(c, `team-${team}`, t(joined ? '离开此队' : '加入此队'), x, 395, 249, 56, !s.connected || (!joined && people.length >= 4), joined);
            if (owner) button(c, `ai-${team}`, '+ AI', x + 268, 395, 152, 56, people.length >= 4 || !s.connected);
        });
        foot = owner ? s.canStart ? t('双方就绪，按 ACTION 开始。') : t('等待人员就绪…') : t('等待房主开始行动。');
    } else if (s.phase === 'round_result' || s.phase === 'game_over') {
        const final = s.phase === 'game_over';
        const title = final ? s.gameOver?.winner ? t('{0} 队获胜', [s.gameOver.winner]) : t('双方平局') :
            s.roundResult?.decrypt_success !== undefined ? t(s.roundResult.decrypt_success ? '解码成功' : '解码失误') :
            t(s.roundResult?.intercept_success ? '密报被截获' : '拦截未成功');
        heading(title);
        // Only a server-revealed history row may be shown to every role.
        const revealed = [...s.history].reverse().find(row => row.round === s.round && row.secret?.length === 3);
        if (revealed) {
            text(c, t('本轮密码'), 55, 229, 22, MUTED);
            revealed.secret!.forEach((digit, i) => {
                text(c, String(digit), 55 + i * 303, 312, 76, tint, 500);
                fitLabel(c, revealed.clues[i] || '—', 55 + i * 303, 394, 28, CREAM, 400, 262);
                line(c, 55 + i * 303, 445, 262, '#3b4b4d');
            });
        } else {
            fitLabel(c, t(final ? '每句看似普通的话，都藏着一场交锋。' : s.roundResult?.intercept_success === false && s.roundResult.decrypt_success === undefined ? '即将进入解码阶段。' : '结果已记录，等待下一轮通信。'), 55, 311, 30, tint, 400, 890);
        }
        foot = t(final ? '按 ACTION 返回通信局；纸带仍可翻阅。' : '结果已记入纸带 · 等待下一步通信。');
    } else if (u.submitted || s.submitted || (!r.encrypt && !r.guess)) {
        const sent = u.submitted || s.submitted;
        heading(t(sent ? '密报已发送。' : s.phase === 'encrypting' ? '等待新的线索。' : s.phase === 'intercept' ? '对手正在拦截。' : '队友正在解码。'));
        fitLabel(c, sent ? t('留意下一步通信。') : s.encryptor && s.phase === 'encrypting' ? t('{0} 正在想线索。', [s.encryptor]) : t('可以拉开纸带，翻阅过往线索。'), 55, 271, 30, tint, 400, 890);
        if (s.clues.length && s.phase !== 'encrypting') {
            s.clues.slice(0, 3).forEach((clue, i) => {
                text(c, `0${i + 1}`, 55, 352 + i * 45, 19, MUTED);
                fitLabel(c, clue, 109, 352 + i * 45, 24, CREAM, 400, 810);
            });
        } else {
            line(c, 55, 366, 890, '#3b4b4d');
            text(c, t('让队友听懂，让对手猜不透。'), 55, 418, 25, MUTED);
        }
        const progress = s.aiStatus ? { ...s.aiStatus, step: s.aiStatus.completed ?? Math.max(0, s.aiStatus.step - 1) } : s.playerProgress;
        foot = progress ? t('{0} · 已完成 {1} / {2}', [progress.player, progress.step, progress.total]) : t('轮到你时，ACTION 会亮起。');
    } else {
        heading(t(r.encrypt ? '写下三条线索。' : s.phase === 'intercept' ? '截获对手的密码。' : '译出队友的密码。'), t(r.encrypt ? diskReadable ? '按私密密码顺序，分别提示对应密词。' : keyDiskMessage(u.keyDisk) : '点击一行，再用下方数字键选择编号。'));
        [0, 1, 2].forEach(i => {
            const y = 239 + i * 92;
            const active = u.focus === `clue-${i}` || r.guess && u.slot === i;
            underline(y + 67, active);
            if (r.encrypt) {
                text(c, diskReadable ? String(s.secretDigits[i] ?? '—') : '—', 55, y + 27, 40, tint, 500);
                fitLabel(c, diskReadable ? word(s.myWords[(s.secretDigits[i] ?? 1) - 1] || s.secretWords[i], u.locale) : t('已隐藏'), 119, y + 27, 25, tint, 500, 152);
                const editable = r.active && s.connected;
                if (u.focus !== `clue-${i}` || !editable)
                    fitLabel(c, u.clues[i] || t('写下关联线索…'), 310, y + 27, 28, u.clues[i] ? CREAM : '#89958f', 400, 624);
                target('screen', `clue-${i}`, t('第 {0} 条线索', [i + 1]), 299, y - 9, 646, 72, {
                    kind: 'input', value: u.clues[i], maxLength: 80, disabled: !editable,
                    input: { fontSize: 28, padding: 11, placeholder: t('写下关联线索…') },
                });
            } else {
                text(c, `0${i + 1}`, 55, y + 27, 22, MUTED);
                fitLabel(c, s.clues[i] || t('等待线索…'), 126, y + 27, 32, CREAM, 500, 674);
                text(c, String(u.guess[i] || '—'), 875, y + 27, 42, active ? tint : MUTED, 500);
                target('screen', `slot-${i}`, t('选择第 {0} 位密码', [i + 1]), 55, y - 9, 890, 78, { disabled: !r.active });
            }
        });
        foot = r.encrypt ? t('已填写 {0} / 3 · 按 ACTION 发报', [u.clues.filter(v => v.trim()).length]) : t('三个不同编号 · 按 ACTION 确认');
    }
    if (!u.manual) {
        line(c, 55, 527, 890, '#3b4b4d');
        fitLabel(c, status || foot, 55, 555, 21, status ? colors.warning.light : MUTED, 400, 890);
    } else if (status && s.error) {
        c.fillStyle = DARK; c.fillRect(50, 539, 900, 42);
        fitLabel(c, status, 55, 559, 19, colors.warning.light, 400, 890);
    }
    function field(id: string, value: string, placeholder: string, x: number, y: number, width: number, height: number, maxLength: number) {
        if (!s.connected) placeholder = t('连接中') + '…';
        line(c, x, y + height, width, u.focus === id ? tint : '#526361');
        if (u.focus !== id || !s.connected) fitLabel(c, value || placeholder, x + 4, y + height / 2, 32, value ? CREAM : '#89958f', 400, width - 20);
        target('screen', id, id === 'name' ? t('特工代号') : t('四位频道编号'), x, y, width, height, { kind: 'input', value, maxLength, disabled: !s.connected,
            input: { fontSize: 32, padding: 4, placeholder } });
    }
    // One source texel per LED; a stroke's antialiased coverage becomes that lamp's duty cycle.
    const dotWords = u.wordDisplay !== 'crt';
    const measureCanvas = document.createElement('canvas').getContext('2d')!;
    const measureDotWord = (value: string, size: number) => {
        measureCanvas.font = `500 ${size}px ${FONT}`;
        return measureCanvas.measureText(value).width;
    };
    for (let i = 0; dotWords && i < 4; i++) {
        const shown = hasGame && !u.hiddenWords ? word(s.myWords[i], u.locale) || '' : '';
        const value = !h.online ? t('离线') : !hasGame ? s.phase === 'room' ? t('待开局') : t('待接入') :
            u.hiddenWords ? '••••' : shown || t('待载入');
        const layout = dotWordLayout(value, measureDotWord);
        const strip = Math.max(dotGrid.cols, layout.width + 2 * dotGrid.inset);
        const g = frame('word' + i, strip, dotGrid.rows, '#000');
        const plot = (x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h);
        const left = dotGrid.inset, right = dotGrid.cols - left, legend = dotType.legend;
        // A channel's brightness is its die's duty cycle: full for type, half for rules.
        g.fillStyle = '#0f0';
        g.fillRect(left, 4, 17, 13);
        g.fillStyle = '#000';
        dotText(String(i + 1).padStart(2, '0'), left + 3, 7, plot);
        g.fillStyle = '#007a00';
        for (let x = left + 21; x < 58; x += 3) g.fillRect(x, 10, 1, 1);
        g.textAlign = 'right';
        fitLabel(g, !h.online ? t('等待连接') : s.myTeam ? t('我方 / {0}', [s.myTeam]) : t('设备待命'), right, 10.5, legend, '#0f0', 400, 52);
        g.textAlign = 'left';
        const middle = (dotGrid.bandTop + dotGrid.bandBottom + 1) / 2;
        layout.lines.forEach((line, n) => text(g, line, left,
            middle + (n - (layout.lines.length - 1) / 2) * dotType.leading, layout.size, h.online ? '#f00' : '#00f', 500));
        g.fillStyle = '#007a00'; g.fillRect(left, 53, right - left, 1);
        const footer = !h.online ? t('连接后恢复') : !hasGame ? t('密钥待分配') :
            u.hiddenWords ? t('已遮住') : t('仅我方可见');
        const statusInk = h.online ? '#0f0' : '#00f';
        g.fillStyle = statusInk; g.fillRect(left, 59, 3, 5);
        fitLabel(g, footer, left + 7, 61.5, legend, statusInk, 400, right - left - 7);
        target('word' + i, 'words', !h.online ? t('离线') : u.hiddenWords ? t('显示秘密词') : t('遮住秘密词'), 0, 0, strip, dotGrid.rows, { disabled: !h.online || !hasGame });
    }
    for (let i = 0; !dotWords && i < 4; i++) {
        const g = frame('word' + i, 480, 284, colors.crt.background);
        const grad = g.createLinearGradient(0, 0, 0, 284);
        grad.addColorStop(0, colors.crt.rim + '3d');
        grad.addColorStop(.6, colors.crt.background + '00');
        grad.addColorStop(1, colors.crt.rim + '30');
        g.fillStyle = grad;
        g.fillRect(0, 0, 480, 284);
        g.strokeStyle = colors.crt.rim + '66';
        g.lineWidth = 1;
        for (let x = 20; x < 480; x += 40) {
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, 284);
            g.stroke();
        }
        for (let y = 15; y < 284; y += 40)
            line(g, 0, y, 480, colors.crt.rim + '66');
        text(g, t("密钥 / 0{0}", [i + 1]), 26, 31, 17, colors.crt.light, 500);
        line(g, 26, 55, 426, colors.crt.rim);
        text(g, String(i + 1), 27, 127, 83, colors.crt.light, 600);
        keyword(g, !h.online ? t('离线') : !hasGame ? s.phase === 'room' ? t("待开局") : t("待接入") : u.hiddenWords ? '••••' : word(s.myWords[i], u.locale) || t("待载入"), 119, 128, 330, colors.crt.light);
        text(g, !h.online ? t('等待连接') : hasGame ? t("仅我方可见") : t("开局后分配秘密词"), 123, 201, 20, colors.crt.light);
        line(g, 26, 237, 426, colors.crt.rim);
        text(g, !h.online ? t('连接后恢复') : !hasGame ? t("编号固定 / 每局重新分配") : u.hiddenWords ? t("● 已遮住 · 点击显示") : t("● 私密词窗 · 点击遮住"), 123, 259, 16, colors.crt.light);
        target('word' + i, 'words', !h.online ? t('离线') : u.hiddenWords ? t("显示秘密词") : t("遮住秘密词"), 0, 0, 480, 284, { disabled: !h.online || !hasGame });
    }
    const b = frame('badge', 660, 150);
    b.textAlign = 'center';
    text(b, 'ORIGINAL GAME', 388, 76, 42, '#e7dfc9', 600);
    b.strokeStyle = '#c6bea6'; b.lineWidth = 4;
    b.beginPath();
    b.moveTo(68, 53); b.lineTo(91, 48); b.lineTo(113, 53); b.lineTo(136, 48);
    b.lineTo(136, 97); b.lineTo(113, 102); b.lineTo(91, 97); b.lineTo(68, 102); b.closePath();
    b.moveTo(113, 53); b.lineTo(113, 102); b.stroke();
    // The hit area follows the complete keycap around the smaller ivory inset.
    target('badge', 'about', u.about ? t('返回操作') : t('原版桌游与购买'), -43, -47, 746, 244);
    // Only ink lives in these textures. Blender owns each card, channel and clip.
    const ro = frame('roster', 800, 1630);
    ro.scale(2, 2);
    frames.roster.width = 400; frames.roster.height = 815;
    text(ro, 'DUTY ROSTER', 24, 32, 22, CREAM, 600);
    line(ro, 22, 55, 356, '#6e685c');
    teams.forEach(team => {
        const palette = teamPalette(team.team, s.myTeam, u.theme);
        const accent = palette.ink;
        const plaque = frame('roster' + team.team, 728, 96);
        // Transparent silkscreen leaves the modeled enamel and bevel visible.
        plateWear(plaque, 728, 96);
        plaque.scale(2, 2);
        if (palette.plate !== palette.ink) {
            plaque.strokeStyle = palette.ink; plaque.lineWidth = 1.5;
            plaque.strokeRect(2, 2, 360, 44);
        }
        text(plaque, t("{0} 队{1}", [team.team, team.own ? t(" / 我方") : '']), 14, 25, 27, palette.onPlate, 600);
        text(plaque, `${team.count} / 4`, 279, 25, 23, palette.onPlate, 500);
        printWear(plaque, 364, 48);
        team.seats.forEach((seat, i) => {
            const p = seat.player;
            const card = frame('roster' + team.team + i, 708, 118);
            card.scale(2, 2);
            const well = frame('rosterWell' + team.team + i, 708, 118);
            well.scale(2, 2);
            if (p) {
                text(card, p.nickname, 20, 19, 28, INK, 600, seat.self || seat.encryptor ? 258 : 318);
                if (seat.self || seat.encryptor) {
                    card.fillStyle = accent; card.fillRect(294, 7, 50, 25);
                    fitLabel(card, seat.self ? t("你") : t("发报"), 299, 20, 17, CREAM, 600, 40);
                }
                text(card, `${seat.code} · ${p.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''}`, 20, 45, 17, '#4f4637', 500, 228);
                // Status shrinks to fit rather than being elided (ENCODING, LISTENING).
                fitLabel(card, t(seat.status), 263, 45, 17, accent, seat.acting ? 600 : 400, 81);
                if (seat.progress) {
                    for (let step = 0; step < 3; step++) {
                        card.fillStyle = step < seat.progress.step / seat.progress.total * 3 ? accent : '#b3a78d';
                        card.fillRect(267 + step * 24, 55, 18, 3);
                    }
                }
            } else {
                // The card is absent; the instruction is stamped into the empty
                // well floor: a dark cut with a faint lower lip of light.
                for (const [dy, color] of [[1.2, '#3d382e'], [0, '#989075']] as const) {
                    text(well, '+', 20, 19 + dy, 27, color);
                    text(well, 'OPEN SEAT', 44, 19 + dy, 26, color, 500);
                    text(well, `${seat.code} / INSERT ID CARD`, 20, 45 + dy, 16, color, 400, 298);
                }
            }
        });
    });
    frame('channel', 600, 240); // Live room digits are modeled wire cathodes.
    const copy = frame('channelCopy', 240, 160);
    copy.textAlign = 'center';
    text(copy, 'COPY', 120, 80, 62, INK, 600);
    target('channelCopy', 'copy-code', t("复制房间码"), 0, 0, 240, 160, { disabled: !h.online || !s.roomCode });
    const scoreFlags: Record<string, boolean> = {};
    // Printed at twice the plate's layout resolution so close views stay sharp.
    const sc = frame('score', 1200, 714);
    sc.scale(2, 2);
    frames.score.width = 600; frames.score.height = 357;
    text(sc, "INTERCEPT", 155, 65, 24, '#57534b', 600);
    text(sc, "ERROR", 397, 65, 24, '#57534b', 600);
    line(sc, 26, 99, 548, '#857f74');
    ['A', 'B'].forEach((team, i) => {
        const score = team === 'A' ? s.scoreA : s.scoreB;
        const yy = 153 + i * 103;
        text(sc, team, 43, yy, 38, '#45413a', 600);
        [score.interceptions, score.decrypt_failures].forEach((n, j) => {
            for (let k = 0; k < 2; k++) {
                scoreFlags[`${team}_${j ? 'failure' : 'intercept'}_${k}`] = k < n;
            }
        });
        if (i === 0) line(sc, 28, 204, 546, '#999387');
    });
    line(sc, 26, 304, 548, '#857f74');
    text(sc, "2 INTERCEPTS TO WIN / 2 ERRORS TO LOSE", 68, 334, 19, '#3b3731');
    printWear(sc, 600, 357);
    plateWear(sc, 600, 357);
    const leader = frame('paper', 840, paperTextureHeight, '#eadfc5');
    const records = archiveRows(s, 'all');
    const pixelsPerUnit = paperTextureHeight / paperTextureLength;
    const printedHeight = pixelsPerUnit * paperLengthForRecords(records.length);
    const printedTop = paperTextureHeight - printedHeight;
    leader.textAlign = 'center';
    text(leader, t("{0} 条记录", [String(records.length).padStart(2, '0')]), 420, paperTextureHeight - 84, 18, '#87765b');
    text(leader, t("DECRYPTO / 密报记录"), 420, printedTop + 43, 29, '#4e493b', 600);
    text(leader, t("频道 {0}   ·   {1} 条记录", [s.roomCode || '----', String(records.length).padStart(2, '0')]), 420, printedTop + 79, 21, '#786b52');
    line(leader, 52, printedTop + 103, 736, '#887b6266');
    leader.textAlign = 'left';
    // At rest the tear bar crosses the stock paperRestLength above the free end;
    // no print may sit under it, or glyph halves peek out below the teeth.
    if (records.length) {
        const rowPitch = (printedHeight - 330) / Math.max(1, records.length - 1);
        records.forEach((row, index) => {
            const y = printedTop + 132 + index * rowPitch;
            text(leader, t("{0}  {1} 队", [String(row.round).padStart(2, '0'), row.team]), 54, y, 29, '#574c38', 600);
            text(leader, row.clues.join(' / '), 218, y, 32, '#403c31', 500, 568);
            text(leader, t("截获 {0}   解码 {1}   密码 {2}", [row.intercept?.join('—') || '———', row.decrypt?.join('—') || '———', row.secret?.join('—') || t("未公开")]), 218, y + 36, 21, '#7c6c52', 400, 568);
            if (index < records.length - 1) line(leader, 52, y + 57, 736, '#a4967866');
        });
    } else {
        text(leader, t("等待第一份密报"), 228, printedTop + 128, 30, '#62583f', 500);
        text(leader, t("回合结束后自动打印公开记录"), 180, printedTop + 166, 24, '#87765b');
    }
    leader.textAlign = 'center';
    text(leader, t("下拉阅读"), 420, paperTextureHeight - 45, 22, '#766349', 500);
    // Above this sheet's header the roll already carries the start of the next
    // sheet: the same leader that will emerge after tearing.
    const reserve = Math.round(pixelsPerUnit * paperHeadReserve);
    leader.drawImage(leader.canvas, 0, paperTextureHeight - reserve, 840, reserve, 0, printedTop - reserve, 840, reserve);
    target('paper', 'archive-toggle', t("下拉纸带查看密报记录，关闭后撕下"), 0, 0, 840, paperTextureHeight);
    const progress = teams.flatMap(team => team.seats).find(seat => seat.acting && seat.progress)?.progress;
    const activity = !hasGame ? 0 : u.submitted ? 1 : r.active ?
        (r.encrypt ? u.clues.filter(value => value.trim()).length : u.guess.filter(Boolean).length) / 3 :
        progress ? Math.max(0, Math.min(1, progress.step / Math.max(1, progress.total))) : 0;
    frame('disk', 400, 200);
    target('disk', 'disk-toggle', u.keyDisk.phase === 'ejected' ? t('按住露出的软盘继续拖出，或点击插回') : u.diskOut ? t("插入软盘，或按住向内推回") : t("按住向外拖出软盘，或点击弹出"), 0, 0, 400, 200,
        { disabled: !diskCurrent || !['ready', 'reading', 'ejected', 'removed', 'pulling'].includes(u.keyDisk.phase) });
    frame('diskEjectControl', 100, 100);
    target('diskEjectControl', 'disk-eject', t('弹出软盘'), 0, 0, 100, 100, { disabled: !diskCurrent || !['ready', 'reading'].includes(u.keyDisk.phase) });
    frame('scopeKnob', 100, 100);
    target('scopeKnob', 'scope-tune', knobLabel('scope-tune', u), 0, 0, 100, 100);
    frame('scopeWaveKnob', 100, 100);
    target('scopeWaveKnob', 'scope-wave', knobLabel('scope-wave', u), 0, 0, 100, 100);
    frame('scopeRateKnob', 100, 100);
    target('scopeRateKnob', 'scope-rate', knobLabel('scope-rate', u), 0, 0, 100, 100);
    frame('scopePersistenceKnob', 100, 100);
    target('scopePersistenceKnob', 'scope-xy', knobLabel('scope-xy', u), 0, 0, 100, 100);
    const cl = frame('clock', 520, 218, '#111a17');
    const running = h.online && hasGame && !['round_result', 'game_over'].includes(s.phase);
    const seconds = Math.max(0, Math.floor(u.seconds));
    const timer = running ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}${String(seconds % 60).padStart(2, '0')}` : '----';
    const glow = h.powered ? running ? seconds <= 15 ? '#ed8960' : '#efb663' : '#65563a' : '#252b21';
    [34, 141, 288, 395].forEach((x, i) => segmentDigit(cl, timer[i], x, 25, glow));
    cl.fillStyle = glow;
    cl.fillRect(257, 61, 10, 10); cl.fillRect(257, 111, 10, 10);
    line(cl, 34, 174, 446, '#3b4030');
    text(cl, running ? t("阶段余时 · 约") : t("等待行动"), 34, 199, 22, h.powered ? '#a39b79' : '#4b483a');
    for (let i = 0; i < 5; i++) {
        const k = frame('key' + i, 180, 200);
        const enabled = r.guess && r.active && h.online && !s.recovering && !u.manual && !u.about;
        text(k, i === 4 ? '←' : String(i + 1), i === 4 ? 27 : 53, 101, 96, enabled ? CREAM : '#8e897f', 500);
        target('key' + i, 'key-' + i, i === 4 ? t("删除上一位") : t("输入数字 {0}", [i + 1]), 0, 0, 180, 200, { disabled: !enabled });
    }
    // Three steps at a 132 px pitch; the modeled dividers sit at 129 and 261.
    const ph = frame('phase', 411, 214);
    [t("加密"), t("拦截"), t("解码")].forEach((label, i) => {
        const active = h.online && s.phase === ['encrypting', 'intercept', 'decrypt'][i];
        const x = 17 + i * 132;
        text(ph, `0${i + 1}`, x, 28, 18, h.powered ? '#a9a497' : '#4d4a43', 500);
        fitLabel(ph, label, x, 79, 23, active ? signal.color : h.powered ? '#a9a497' : '#4d4a43', 400, 88);
        ph.fillStyle = active ? signal.color : '#2b2824';
        round(ph, x + 2, 129, 78, 17, 8);
        ph.fill();
        if (i < 2) text(ph, '›', 114 + i * 132, 78, 28, h.powered ? '#857f75' : '#403c36');
    });
    text(ph, s.phase === 'home' || s.phase === 'room' ? t("等待行动开始") : t("第 {0} / 16 回合", [s.round]), 18, 190, 21, h.powered ? '#c1bcad' : '#4d4a43');
    const tr = frame('transmitLabel', 600, 164);
    const homeReady = s.phase === 'home' && !!u.name.trim() && (u.mode === 'create' || u.code.length === 4) && s.connected;
    const lobbyReady = s.phase === 'room' && s.canStart && s.ownerID === s.myPlayerID && s.connected;
    const ready = !!(r.ready || homeReady || lobbyReady || s.phase === 'game_over') && h.online && !u.manual && !u.about;
    const transmitText = s.phase === 'home' ? u.mode === 'create' ? t("建立频道") : t("接入频道") : s.phase === 'room' ? t("开始行动") : s.phase === 'game_over' ? t("返回通信局") : u.submitted ? t("已发送") : t("发报 · 确认");
    const command = 'ACTION';
    tr.textAlign = 'center';
    tr.letterSpacing = '7px';
    text(tr, command, 304, 60, command.length > 6 ? 78 : 91, '#e9ddc2', 700);
    tr.letterSpacing = '3px';
    text(tr, 'PRESS TO CONFIRM', 302, 135, 25, '#e9ddc2', 500);
    frame('transmitControl', 600, 260);
    target('transmitControl', 'transmit', transmitText, 0, 0, 600, 260, { disabled: !ready });
    const dl = frame('disklabel', 900, 300);
    dl.scale(3, 3);
    const handwriting = diskInscription(u.keyDisk.id);
    dl.save();
    dl.translate(150 + handwriting.x, 43 + handwriting.y);
    dl.rotate(handwriting.tilt);
    dl.font = '700 52px "Disk Hand", "Bradley Hand", cursive';
    const handSize = Math.min(52, 52 * 260 / Math.max(1, dl.measureText(handwriting.text).width));
    dl.font = `700 ${handSize}px "Disk Hand", "Bradley Hand", cursive`;
    dl.textBaseline = 'middle';
    dl.fillStyle = handwriting.ink;
    const handWidth = dl.measureText(handwriting.text).width;
    let penSeed = handwriting.seed;
    [...handwriting.text].forEach((letter, index) => {
        penSeed = (Math.imul(penSeed, 1664525) + 1013904223) >>> 0;
        dl.save();
        dl.translate(-handWidth / 2 + dl.measureText(handwriting.text.slice(0, index)).width, ((penSeed >>> 16) % 7 - 3) * .28);
        dl.rotate(((penSeed >>> 24) % 7 - 3) * .007);
        dl.globalAlpha = .86 + (penSeed % 15) / 100;
        dl.fillText(letter, 0, 0);
        dl.restore();
    });
    if (handwriting.seed & 1) {
        dl.strokeStyle = handwriting.ink;
        dl.lineWidth = 1.2;
        dl.lineCap = 'round';
        dl.globalAlpha = .7;
        dl.beginPath();
        dl.moveTo(-handWidth / 2 - 2, 22);
        dl.quadraticCurveTo(4, 19 + handwriting.y, handWidth / 2 + 3, 23);
        dl.stroke();
    }
    dl.restore();
    text(dl, `KEY / ${String(s.round || 0).padStart(2, '0')}`, 16, 87, 13, '#817c70', 500);
    fitLabel(dl, ownsDisk ? t('{0} 队 · 仅你可见', [s.myTeam]) : 'DECRYPTO', 116, 87, 13, '#817c70', 500, 168);
    frame('powerControl', 320, 180);
    target('powerControl', 'power-toggle', u.powerOn ? t("关闭终端电源") : t("开启终端电源"), 0, 0, 320, 180);
    const ft = frame('footer', 1100, 65);
    text(ft, 'NETWORK', 350, 32, 29, '#3e3a33');
    text(ft, 'UNOFFICIAL EDITION', 770, 32, 18, '#817c70');
    frame('batteryControl', 100, 100);
    target('batteryControl', 'battery-toggle', u.batteryOpen ? t("合上电池仓盖") : t("掀开电池仓盖，查看四节电池"), 0, 0, 100, 100);
    frame('soundControl', 100, 100);
    target('soundControl', 'sound-toggle', u.soundOn ? t("关闭音效") : t("开启音效"), 0, 0, 100, 100);
    frame('musicControl', 100, 100);
    target('musicControl', 'music-toggle', u.musicOn ? t('关闭背景音乐') : t('开启背景音乐'), 0, 0, 100, 100);
    frame('testControl', 100, 100);
    target('testControl', 'lamp-test', t("本机灯光自检，不改变对局连接"), 0, 0, 100, 100, { disabled: !h.powered });
    const rearControls = new Set(['battery-toggle', 'sound-toggle', 'music-toggle', 'lamp-test']);
    for (let i = 0; i < 4; i++) {
        const name = `batteryCell${i}Control`, id = `battery-cell-${i}`;
        frame(name, 100, 300);
        if (u.batteryOpen) target(name, id, t("{0}第 {1} 节电池", [u.removedBatteries & (1 << i) ? t("装回") : t("取出"), i + 1]), 0, 0, 100, 300);
        rearControls.add(id);
    }
    ['RJ45', 'Serial', 'DC'].forEach((name, i) => {
        const surface = `${name}PlugControl`, id = `cable-plug-${i}`;
        frame(surface, 180, 100);
        target(surface, id, u.unpluggedCables & (1 << i) ? `${t("插回")}${[t("网线"), t("串口线"), t("电源线")][i]}` : t(['拔出网线 · 终端将脱机', '拔出串口线 · SIGNAL 将失去输入', '拔出电源线 · 尝试由电池接管'][i]), 0, 0, 180, 100);
        rearControls.add(id);
    });
    for (const [name, id] of [['MeterAmplitude', 'meter-amplitude'], ['MeterRate', 'meter-rate']]) {
        frame(name + 'Control', 100, 100);
        target(name + 'Control', id, knobLabel(id, u), 0, 0, 100, 100);
    }
    frame('receiverSweepControl', 100, 100);
    if (u.instrumentVariant === 'signal') {
        target('receiverSweepControl', 'receiver-sweep',
            u.instrumentDemo ? t("关闭自动摆动，恢复手动调谐") : t("开启自动信号摆动"), 0, 0, 100, 100);
    }
    const seats: Record<string, string | null> = {};
    teams.forEach(team => team.seats.forEach((seat, i) => { seats[team.team + i] = seat.player?.id ?? null; }));
    if (!h.online && h.powered) {
        c.fillStyle = DARK; c.fillRect(0, 0, w, frames.screen.height);
        const warning = themeColors(u.theme).warning.light;
        text(c, 'NETWORK / OFFLINE', 55, 55, 18, warning, 500);
        text(c, t('已断开连接'), 55, 146, 48, CREAM, 500);
        text(c, t(h.linked ? '正在尝试重新连接…' : '网线已拔出，请接回网线。'), 55, 225, 25, warning, 400, 870);
        line(c, 55, 278, 890, '#34423f');
        text(c, t('连接恢复后，词窗与房间码将重新显示。'), 55, 325, 23, CREAM, 400, 870);
        text(c, t('输入已保留，不会自动提交。'), 55, 373, 22, MUTED, 400, 870);
        if (!h.linked) button(c, 'restore-link', t('接回网线'), 55, 443, 350, 60);
        else text(c, t('等待连接'), 55, 470, 22, MUTED);
        if (s.roomCode) text(c, t('对局仍在进行'), 55, 557, 18, MUTED);
    }
    // Flat, slanted charge segments share the CRT phosphor. Paint after the
    // offline page so power and network status stay independent.
    if (h.batteryPercent !== null) {
        c.save();
        c.fillStyle = themeColors(u.theme).device.light;
        const x = right - 116, y = 38;
        c.strokeStyle = c.fillStyle;
        c.lineWidth = 1.5;
        round(c, x, y, 64, 22, 2);
        c.stroke();
        c.fillRect(x + 66, y + 7, 3, 8);
        for (let i = 0; i < 4; i++) {
            const left = x + 6 + i * 13, top = y + 4;
            c.globalAlpha = i < h.batteryPercent / 25 ? 1 : .18;
            c.beginPath();
            c.moveTo(left + 4, top);
            c.lineTo(left + 13, top);
            c.lineTo(left + 9, top + 14);
            c.lineTo(left, top + 14);
            c.closePath();
            c.fill();
        }
        c.globalAlpha = 1;
        c.textAlign = 'right';
        text(c, `${h.batteryPercent}%`, right, 49, 17, themeColors(u.theme).device.light, 500);
        c.restore();
    }
    for (const name of ['screen', 'word0', 'word1', 'word2', 'word3']) {
        if (dotWords && name !== 'screen') continue;
        const { canvas } = frames[name];
        crtFinish(canvas.getContext('2d')!, canvas.width, canvas.height, name.startsWith('word'));
    }
    if (!h.powered) {
        for (const name of ['screen', 'word0', 'word1', 'word2', 'word3', 'channel']) {
            const { canvas } = frames[name];
            const display = canvas.getContext('2d')!;
            display.setTransform(1, 0, 0, 1, 0, 0);
            display.clearRect(0, 0, canvas.width, canvas.height);
            display.fillStyle = name.startsWith('word') ? dotWords ? '#000' : '#0b1012' : '#0b1313';
            display.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
    return { frames, screenPrivacyKey: `${h.online}:${keyDiskIdentity(s)}:${diskReadable}`, teamPlates: { A: teamPalette('A', s.myTeam, u.theme).plate, B: teamPalette('B', s.myTeam, u.theme).plate }, wordTube: colors.crt, displayKey: u.theme, wordInks: { ...colors.led, warning: colors.led.legend }, wordPrivacyKey: `${h.online}:${s.roomCode}:${s.myTeam}:${hasGame}:${u.hiddenWords}:${s.myWords.join("|")}`, paletteKey: `${u.theme}:${s.myTeam || 'unassigned'}`, connected: h.online, trafficKey: JSON.stringify([s.phase, s.round, s.submitted, s.aiStatus, s.playerProgress, s.history.length, s.players]), targets: targets.filter(t => (inspection || rearControls.has(t.id) === u.backView) &&
            (h.powered || rearControls.has(t.id) || ['power-toggle', 'disk-toggle', 'disk-eject'].includes(t.id)) &&
            (h.online || t.surface !== 'screen' || t.id === 'restore-link')),
        status: !h.online ? t(hardwareMessage(u, s)) : status || `${t(({ home: '通信局', room: '队伍准备', encrypting: '加密', intercept: '拦截', decrypt: '解码', round_result: '本轮回执', game_over: '行动结束' })[s.phase])} · ${s.connected ? t("已连接") : t("连接中")}`,
        tint, waiting, ready: ready && h.online, scoreFlags, seats, roomCode: h.powered ? h.online ? s.roomCode || '' : '0000' : '',
        paperRecords: records.length, activity: h.powered ? activity : 0 };
}
