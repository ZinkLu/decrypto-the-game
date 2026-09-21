import { translate, localizeError } from './i18n';
import { roleState, rosterTeams, word, resultTint, archiveRows, scopeModes, scopeTimebase, scopeTriggerLevel } from './model';
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
    tint: string;
    waiting: boolean;
    ready: boolean;
    lamps: Record<string, boolean>;
    seats: Record<string, string | null>;
    activity: number;
    roomCode: string;
    paperRecords: number;
}
const INK = '#243344', CREAM = '#ece0c4', MUTED = '#a59e8c', DARK = '#111e24';
const FONT = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const teamInk = (team: string) => team === 'A' ? '#365c68' : '#943f30';
const teamLight = (team: string) => team === 'A' ? '#adced4' : '#edb09a';
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
function keyword(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number) {
    // Both languages start at 60 px. Long phrases wrap at word boundaries;
    // only content that does not fit shrinks, and secret words are never elided.
    const base = 60;
    c.font = `600 ${base}px ${FONT}`;
    if (c.measureText(value).width <= width) {
        text(c, value, x, y, base, '#f4b07f', 600);
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
        lines.forEach((line, i) => text(c, line, x, y + (i - .5) * size * 1.08, size, '#f4b07f', 600));
    } else fitLabel(c, value, x, y, base, '#f4b07f', 600, width);
}
function wrap(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 22, color = CREAM, maxLines = 3) {
    c.font = `400 ${size}px ${FONT}`;
    let line = '', lineCount = 0;
    for (const char of value) {
        if (c.measureText(line + char).width > width || char === '\n') {
            text(c, line, x, y + lineCount * size * 1.55, size, color);
            if (++lineCount >= maxLines)
                return;
            line = char === '\n' ? '' : char;
        }
        else
            line += char;
    }
    text(c, line, x, y + lineCount * size * 1.55, size, color);
}
function line(c: CanvasRenderingContext2D, x: number, y: number, w: number, color = '#596269') {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.stroke();
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
function portrait(c: CanvasRenderingContext2D, x: number, y: number, size: number, ai: boolean, ink: string) {
    c.save();
    c.translate(x, y);
    c.scale(size / 48, size / 48);
    c.fillStyle = ink;
    c.fillRect(0, 0, 48, 48);
    c.strokeStyle = '#e7d9b3a0';
    c.lineWidth = 1;
    c.strokeRect(3.5, 3.5, 41, 41);
    c.fillStyle = '#eadfc5';
    if (ai) {
        c.fillRect(13, 14, 22, 21);
        for (let i = 0; i < 3; i++) {
            c.fillRect(9, 17 + i * 7, 3, 2); c.fillRect(36, 17 + i * 7, 3, 2);
            c.fillRect(17 + i * 7, 10, 2, 3); c.fillRect(17 + i * 7, 36, 2, 3);
        }
        c.fillStyle = ink;
        c.fillRect(18, 20, 4, 5); c.fillRect(27, 20, 4, 5); c.fillRect(20, 29, 9, 2);
    } else {
        c.beginPath(); c.arc(24, 18, 7, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(24, 36, 13, 10, 0, Math.PI, Math.PI * 2); c.fill();
    }
    c.restore();
}
export function knobLabel(id: string, u: LocalState) {
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    if (id === 'scope-tune') return t('触发电平 {0} V', [scopeTriggerLevel(u.scopeTrigger).toFixed(2)]);
    if (id === 'scope-rate') return t('扫描时基 {0} ms/格', [(scopeTimebase(u.scopeRate) * 1000).toFixed(3)]);
    if (id === 'scope-persist') return t('光迹亮度 {0}%', [Math.round(u.scopeIntensity * 100)]);
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

export function paint(s: StationState, u: LocalState): Content {
    const t = (message: string, values?: unknown[]) => translate(u.locale, message, values);
    const frames: Record<string, Frame> = {};
    const targets: Target[] = [];
    const r = roleState(s, u);
    const teams = rosterTeams(s, u);
    const hasGame = !['home', 'room'].includes(s.phase);
    const waiting = hasGame && !r.active && !['round_result', 'game_over'].includes(s.phase);
    const resultColor = ['round_result', 'game_over'].includes(s.phase) ? resultTint(s) : r.color;
    const tint = waiting ? '#a8bcc5' : resultColor;
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
        if (u.focus === id && !options.disabled && !surface.endsWith('Control')) {
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
    text(c, hasGame ? t("第 {0} 回合", [String(s.round).padStart(2, '0')]) : t("DECRYPTO  /  通信局"), 55, 49, 19, tint, 500);
    text(c, s.roomCode ? `CH ${s.roomCode}  /  ${s.myTeam ? s.myTeam + t(" 队") : t("待编组")}  /  ${s.connected ? t("已接通") : t("连接中")}` : t("双队通信  /  4–8 人"), 500, 49, 16, MUTED, 400, 338);
    button(c, 'manual', u.manual ? t("返回") : t("手册"), right - 100, 28, 100, 39);
    if (u.rosterOpen) {
        text(c, t("频道人员 · 值勤名册"), 55, 112, 36, tint, 600);
        button(c, 'roster-toggle', t("返回操作"), 799, 88, 146, 47);
        text(c, s.phase === 'home' ? t("建立或加入频道后，在这里查看队伍与当前行动。") : t("频道 {0} · {1} 人已编组 · 每队 2–4 人", [s.roomCode, s.teamA.length + s.teamB.length]), 55, 164, 21, MUTED, 400, 890);
        teams.forEach((team, j) => {
            const x = 55 + j * 457;
            text(c, t("{0} 队{1}", [team.team, team.own ? t(" / 我方") : '']), x, 215, 27, teamLight(team.team), 600);
            text(c, t(team.summary), x + 252, 215, 20, teamLight(team.team));
            line(c, x, 240, 430, '#45514d');
            team.seats.forEach((seat, i) => {
                const y = 252 + i * 64;
                if (seat.player) {
                    portrait(c, x, y + 6, 45, seat.player.is_ai, teamInk(team.team));
                    const name = seat.player.nickname;
                    c.font = `500 25px ${FONT}`;
                    const nameSize = Math.max(16, Math.min(25, 25 * 350 / Math.max(1, c.measureText(name).width)));
                    text(c, name, x + 58, y + 16, nameSize, CREAM, 500, 350);
                    text(c, `${seat.code}${seat.self ? t(" · 你") : ''} · ${seat.player.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''} · ${t(seat.status)}${seat.progress ? ` ${seat.progress.step}/${seat.progress.total}` : ''}`, x + 58, y + 44, 18, seat.acting ? tint : MUTED, 400, 350);
                } else {
                    text(c, '+', x + 12, y + 25, 29, MUTED);
                    text(c, t("{0}  空席", [seat.code]), x + 58, y + 16, 23, MUTED);
                    text(c, t(seat.status), x + 58, y + 44, 18, MUTED);
                }
                line(c, x, y + 61, 430, '#2c3a3b');
            });
        });
        const unassigned = s.players.filter(p => ![...s.teamA, ...s.teamB].some(member => member.id === p.id)).length;
        text(c, unassigned ? t("{0} 人尚未选择队伍 · 在集合界面加入 A 队或 B 队", [unassigned]) : t("姓名牌标记当前行动 · 点击左侧名册收起"), 55, 532, 20, tint, 400, 890);
    }
    else if (u.manual) {
        text(c, t("让队友听懂，让对手迷失。"), 55, 113, 34, tint, 600);
        const rules = [t("每队至少两人，可以由 AI 补位。"), t("四个秘密词对应编号 1–4，词窗仅我方可见。"), t("加密者按三位密码顺序，各写一条关联线索。"), t("对手先拦截，再由队友解码；前两回合跳过拦截。"), t("截获两次，或对方解码失误两次，即获胜。"), t("数字键选择密码，退格删除；按下红色发报键确认。"), t("点击纸带抽出档案，按队伍对照并写私人笔记。")];
        rules.forEach((t, i) => wrap(c, t, 55, 181 + i * 47, w - 110, 21, CREAM, 2));
        text(c, t("线上版最多 16 回合；截获成功会结束该回合。"), 55, 537, 18, MUTED, 400, w - 110);
    }
    else if (s.phase === 'home') {
        text(c, t("接通你的秘密频道。"), 55, 118, 43, tint, 600);
        text(c, t("同样的线索，不同的秘密。"), 55, 169, 24, MUTED);
        button(c, 'mode-create', t("建立频道"), 55, 212, 180, 47, false, u.mode === 'create');
        button(c, 'mode-join', t("加入频道"), 246, 212, 180, 47, false, u.mode === 'join');
        text(c, t("编组  →  加密  →  破译"), 615, 236, 20, MUTED);
        text(c, t("特工代号"), 55, 296, 21, tint);
        field('name', u.name, t("输入你的昵称"), 55, 320, w - 110, 61, 20);
        if (u.mode === 'join') {
            text(c, t("四位频道编号"), 55, 413, 21, tint);
            field('code', u.code, t("例如 1234"), 55, 437, w - 110, 61, 4);
        }
        else {
            text(c, t("4–8 位玩家 · 支持 AI 队友"), 55, 437, 23, CREAM);
            text(c, t("填写代号后，按下右侧红键建立频道。"), 55, 485, 21, MUTED, 400, w - 110);
        }
    }
    else if (s.phase === 'room') {
        text(c, t("频道 {0} · 集合", [s.roomCode ?? '—']), 55, 111, 36, tint, 600);
        button(c, 'copy-code', t("复制频道"), right - 134, 84, 134, 47);
        text(c, t("选择队伍，房主可添加 AI。每队至少两人。"), 55, 166, 22, MUTED, 400, w - 110);
        const owner = s.ownerID === s.myPlayerID;
        const col = (w - 132) / 2;
        ['A', 'B'].forEach((team, j) => {
            const x = 55 + j * (col + 22), people = team === 'A' ? s.teamA : s.teamB;
            text(c, t("{0} 队  /  {1} 人", [team, people.length]), x, 215, 27, team === 'A' ? '#9fbfd1' : '#e8a28c', 600);
            line(c, x, 244, col);
            Array.from({ length: 4 }, (_, i) => {
                const p = people[i], y = 254 + i * 46;
                if (p) {
                    portrait(c, x, y + 4, 33, p.is_ai, teamInk(team));
                    text(c, `${p.nickname}${p.id === s.myPlayerID ? t(" · 你") : ''}`, x + 45, y + 20, 23, CREAM, 500, col - 178);
                    text(c, p.id === s.ownerID ? t("房主") : p.is_ai ? 'AI' : t("真人"), x + col - 123, y + 21, 17, MUTED);
                    if (owner && p.is_ai)
                        button(c, `remove-${team}-${i}`, '×', x + col - 38, y + 4, 38, 32);
                } else {
                    text(c, '+', x + 6, y + 21, 25, MUTED);
                    text(c, t("空席 {0}{1} · 等待好友或 AI", [team, i + 1]), x + 45, y + 21, 19, MUTED, 400, col - 50);
                }
                line(c, x, y + 43, col, '#2e3d3d');
            });
            const joined = people.some(p => p.id === s.myPlayerID);
            button(c, `team-${team}`, joined ? t("离开此队") : t("加入此队"), x, 451, col * .59, 47, !s.connected || (!joined && people.length >= 4), joined);
            if (owner)
                button(c, `ai-${team}`, '+ AI', x + col * .62, 451, col * .38, 47, people.length >= 4 || !s.connected);
        });
        text(c, owner ? s.canStart ? t("人员就绪，按下红键开始行动。") : t("等待人员就绪…") : t("等待房主开始行动。"), 55, 535, 22, tint, 400, w - 110);
    }
    else if (s.phase === 'round_result' || s.phase === 'game_over') {
        const final = s.phase === 'game_over';
        const title = final ? s.gameOver?.winner ? t("{0} 队获胜", [s.gameOver.winner]) : t("双方平局") :
            s.roundResult?.decrypt_success !== undefined ? s.roundResult.decrypt_success ? t("解码成功") : t("解码失误") :
                s.roundResult?.intercept_success ? t("密报被截获") : t("拦截未成功");
        text(c, final ? t("行动结束") : t("本轮回执"), 55, 123, 25, tint);
        text(c, title, 55, 221, 59, tint, 600);
        wrap(c, final ? t("每句看似普通的话，都藏着一场交锋。") : s.roundResult?.intercept_success === false && s.roundResult.decrypt_success === undefined ? t("即将进入解码阶段。") : t("结果已记录，等待下一轮通信。"), 55, 304, w - 110, 25);
        ['A', 'B'].forEach((team, i) => {
            const score = team === 'A' ? s.scoreA : s.scoreB;
            text(c, t("{0} 队     截获 {1} / 2     失误 {2} / 2", [team, score.interceptions, score.decrypt_failures]), 55, 408 + i * 57, 27, CREAM);
        });
        if (final)
            text(c, t("按下红键返回通信局；纸带仍可翻阅。"), 55, 539, 21, MUTED, 400, w - 110);
    }
    else {
        const title = u.submitted ? t("密报已发送") : r.encrypt ? t("你的回合 · 加密") : r.guess ? s.phase === 'intercept' ? t("截获对方密报") : t("解读队友线索") : s.phase === 'encrypting' ? t("等待加密者发报") : s.phase === 'intercept' ? t("对方正在拦截") : t("等待队友解码");
        text(c, title, 55, 113, w < 900 ? 33 : 42, tint, 600);
        const description = r.encrypt ? t("按密码顺序写下三条线索，让队友读懂。") : r.guess ? t("对照线索与档案，选择三个不同的编号。") : s.encryptor ? t("本轮加密者：{0}", [s.encryptor]) : t("留意通信信号，可以随时翻阅档案。");
        text(c, description, 55, 166, 22, MUTED, 400, w - 110);
        [0, 1, 2].forEach(i => {
            const y = 211 + i * 91;
            c.strokeStyle = (u.focus === `clue-${i}` || r.guess && u.slot === i) ? tint : '#5b5842';
            c.lineWidth = 1.6;
            round(c, 55, y, w - 110, 75, 9);
            c.stroke();
            if (r.encrypt) {
                text(c, String(s.secretDigits[i] ?? '—'), 75, y + 38, 38, tint, 600);
                fitLabel(c, word(s.myWords[(s.secretDigits[i] ?? 1) - 1] || s.secretWords[i], u.locale), 126, y + 38, 25, tint, 500, 130);
                line(c, 267, y + 17, 0);
                c.fillStyle = '#504c37';
                c.fillRect(267, y + 16, 1, 43);
                text(c, u.clues[i] || t("写下关联线索…"), 288, y + 38, 25, u.clues[i] ? CREAM : '#7e8278', 400, w - 372);
                target('screen', `clue-${i}`, t("第 {0} 条线索", [i + 1]), 277, y + 3, w - 336, 69, { kind: 'input', value: u.clues[i], maxLength: 40, disabled: !r.active || !s.connected });
                if (u.focus === `clue-${i}` && !u.clues[i]) {
                    c.fillStyle = tint;
                    c.fillRect(288, y + 23, 2, 29);
                }
            }
            else {
                text(c, `0${i + 1}`, 75, y + 38, 24, MUTED);
                text(c, s.clues[i] || t("等待线索…"), 134, y + 38, 28, s.clues[i] ? CREAM : MUTED, 500, w - 330);
                if (r.guess) {
                    text(c, String(u.guess[i] || '—'), w - 121, y + 38, 36, tint, 600);
                    target('screen', `slot-${i}`, t("选择第 {0} 位密码", [i + 1]), 55, y, w - 110, 75, { disabled: !r.active });
                }
                else if (s.playerProgress && s.playerProgress.step > i) {
                    text(c, t("已完成"), w - 147, y + 38, 19, tint);
                }
            }
        });
        const progress = s.aiStatus ? { ...s.aiStatus, step: s.aiStatus.completed ?? Math.max(0, s.aiStatus.step - 1) } : s.playerProgress;
        const foot = u.submitted ? t("已提交，等待其他玩家。") : r.active ? r.encrypt ? t("已填写 {0} / 3 · 按下右侧红键提交", [u.clues.filter(v => v.trim()).length]) : t("当前密码  {0} · 按下红键确认", [u.guess.map(n => n || '—').join(' · ')]) : s.aiStatus && ["thinking", "retrying"].includes(s.aiStatus.state || "thinking") ? t("AI 正在推理第 {0} 条 · 已完成 {1}/3", [s.aiStatus.step, progress?.step ?? 0]) : progress ? t("{0} · 已完成 {1} / {2}", [progress.player, progress.step, progress.total]) : t("链路已接通 · 等待信号");
        text(c, foot, 55, 525, 21, tint, 400, w - 110);
    }
    if (status) {
        c.fillStyle = '#432c28';
        round(c, 42, 548, w - 84, 35, 6);
        c.fill();
        text(c, status, 54, 565, 18, '#ffd0b4', 400, w - 109);
    } else {
        line(c, 55, 558, 890, '#34423f');
        text(c, hasGame ? t("密钥仅我方可见") : t("每条线索，都是一次试探。"), 55, 577, 14, MUTED);
        text(c, u.rosterOpen ? t("PERSONNEL / 值勤记录") : u.manual ? t("FIELD GUIDE / 行动手册") : t("D / 密码通信"), 662, 577, 13, MUTED);
    }
    // Fine glass scanlines are deliberately faint, never across the paper.
    c.fillStyle = 'rgba(160,194,180,.025)';
    for (let y = 0; y < 593; y += 4)
        c.fillRect(0, y, 1000, 1);
    function field(id: string, value: string, placeholder: string, x: number, y: number, width: number, height: number, maxLength: number) {
        c.strokeStyle = u.focus === id ? tint : '#677367';
        c.lineWidth = 2;
        round(c, x, y, width, height, 8);
        c.stroke();
        text(c, value || placeholder, x + 18, y + height / 2, 27, value ? CREAM : '#88928b', 400, width - 36);
        target('screen', id, id === 'name' ? t("特工代号") : t("四位频道编号"), x, y, width, height, { kind: 'input', value, maxLength, disabled: !s.connected });
    }
    for (let i = 0; i < 4; i++) {
        const g = frame('word' + i, 480, 284, '#360a06');
        const grad = g.createLinearGradient(0, 0, 0, 284);
        grad.addColorStop(0, 'rgba(196,40,16,.24)');
        grad.addColorStop(.6, 'rgba(80,9,5,0)');
        grad.addColorStop(1, 'rgba(201,42,15,.19)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 480, 284);
        g.strokeStyle = '#612016';
        g.lineWidth = 1;
        for (let x = 20; x < 480; x += 40) {
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, 284);
            g.stroke();
        }
        for (let y = 15; y < 284; y += 40)
            line(g, 0, y, 480, '#612016');
        text(g, t("密钥 / 0{0}", [i + 1]), 26, 31, 17, '#c67d5e', 500);
        line(g, 26, 55, 426, '#99513a');
        text(g, String(i + 1), 27, 127, 83, '#ed7653', 600);
        keyword(g, !hasGame ? s.phase === 'room' ? t("待开局") : t("待接入") : u.hiddenWords ? '••••' : word(s.myWords[i], u.locale) || t("待载入"), 119, 128, 330);
        text(g, hasGame ? t("仅我方可见") : t("开局后分配秘密词"), 123, 201, 20, '#ba6750');
        line(g, 26, 237, 426, '#99513a');
        text(g, !hasGame ? t("编号固定 / 每局重新分配") : u.hiddenWords ? t("● 已遮住 · 点击显示") : t("● 私密词窗 · 点击遮住"), 123, 259, 16, '#c67d5e');
        target('word' + i, 'words', u.hiddenWords ? t("显示秘密词") : t("遮住秘密词"), 0, 0, 480, 284, { disabled: !hasGame });
    }
    const b = frame('badge', 660, 150);
    b.textAlign = 'center';
    text(b, 'FIELD GUIDE', 382, 76, 49, '#e7dfc9', 600);
    b.strokeStyle = '#c6bea6'; b.lineWidth = 4;
    b.beginPath();
    b.moveTo(68, 53); b.lineTo(91, 48); b.lineTo(113, 53); b.lineTo(136, 48);
    b.lineTo(136, 97); b.lineTo(113, 102); b.lineTo(91, 97); b.lineTo(68, 102); b.closePath();
    b.moveTo(113, 53); b.lineTo(113, 102); b.stroke();
    // The hit area follows the complete keycap around the smaller ivory inset.
    target('badge', 'manual', u.manual ? t("返回操作") : t("查看行动手册"), -43, -47, 746, 244);
    // Only ink lives in these textures. Blender owns each card, channel and clip.
    const ro = frame('roster', 800, 1630);
    ro.scale(2, 2);
    frames.roster.width = 400; frames.roster.height = 815;
    text(ro, 'DUTY ROSTER', 24, 32, 22, CREAM, 600);
    text(ro, 'VIEW ↗', 297, 33, 16, '#cbbd9f');
    line(ro, 22, 55, 356, '#657165');
    teams.forEach(team => {
        const accent = teamInk(team.team);
        const plaque = frame('roster' + team.team, 728, 96);
        plaque.scale(2, 2);
        text(plaque, t("{0} 队{1}", [team.team, team.own ? t(" / 我方") : '']), 14, 25, 27, CREAM, 600);
        text(plaque, `${team.count} / 4`, 279, 25, 23, CREAM, 500);
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
                text(card, `${seat.code} · ${p.is_ai ? 'AI' : t("真人")}${seat.owner ? t(" · 房主") : ''}`, 20, 45, 16, '#655c46', 500, 228);
                text(card, t(seat.status), 263, 45, 17, accent, seat.acting ? 600 : 400, 81);
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
    text(ro, 'PERSONNEL / PRESS TO INSPECT', 54, 802, 14, '#bfb69e');
    target('roster', 'roster-toggle', u.rosterOpen ? t("收起队员名册，返回操作") : t("查看队员名册与行动状态"), 0, 0, 400, 815);
    frame('channel', 600, 240); // Live room digits are modeled wire cathodes.
    const copy = frame('channelCopy', 240, 160);
    copy.textAlign = 'center';
    text(copy, 'COPY', 120, 80, 62, INK, 600);
    target('channelCopy', 'copy-code', t("复制房间码"), 0, 0, 240, 160, { disabled: !s.roomCode });
    const lamps: Record<string, boolean> = {};
    const sc = frame('score', 600, 357);
    text(sc, "SCORE", 28, 30, 19, '#414940', 500);
    text(sc, "INTERCEPT", 155, 65, 24, INK, 600);
    text(sc, "ERROR", 397, 65, 24, INK, 600);
    line(sc, 26, 99, 548, '#7b847b');
    ['A', 'B'].forEach((team, i) => {
        const score = team === 'A' ? s.scoreA : s.scoreB;
        const yy = 153 + i * 103;
        sc.fillStyle = teamInk(team); round(sc, 28, yy - 29, 60, 58, 3); sc.fill();
        text(sc, team, 43, yy, 38, CREAM, 600);
        [score.interceptions, score.decrypt_failures].forEach((n, j) => {
            for (let k = 0; k < 2; k++) {
                lamps[`${team}_${j ? 'failure' : 'intercept'}_${k}`] = k < n;
                text(sc, String(k + 1), 183 + j * 227 + k * 76, yy + 34, 15, '#434c43');
            }
        });
        if (i === 0) line(sc, 28, 204, 546, '#90978c');
    });
    line(sc, 26, 304, 548, '#7b847b');
    text(sc, "2 INTERCEPTS TO WIN / 2 ERRORS TO LOSE", 68, 334, 19, '#374137');
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
    if (records.length) {
        const rowPitch = (printedHeight - 307) / Math.max(1, records.length - 1);
        records.forEach((row, index) => {
            const y = printedTop + 132 + index * rowPitch;
            text(leader, t("{0}  {1} 队", [String(row.round).padStart(2, '0'), row.team]), 54, y, 29, '#574c38', 600);
            text(leader, row.clues.join(' / '), 218, y, 32, '#403c31', 500, 568);
            text(leader, t("截获 {0}   解码 {1}   密码 {2}", [row.intercept?.join('—') || '———', row.decrypt?.join('—') || '———', row.secret?.join('—') || t("未公开")]), 218, y + 36, 21, '#7c6c52', 400, 568);
            line(leader, 52, y + 57, 736, '#a4967866');
        });
    } else {
        text(leader, t("等待第一份密报"), 228, printedTop + 173, 33, '#62583f', 500);
        text(leader, t("回合结束后自动打印公开记录"), 180, printedTop + 220, 25, '#87765b');
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
    target('disk', 'disk-toggle', u.diskOut ? t("插入软盘") : t("弹出软盘"), 0, 0, 400, 200);
    frame('diskEjectControl', 100, 100);
    target('diskEjectControl', 'disk-eject', t('弹出软盘'), 0, 0, 100, 100, { disabled: u.diskOut });
    frame('scopeModeControl', 420, 350);
    target('scopeModeControl', 'scope-mode', t("点击屏幕切换波形 · {0}", [t(scopeModes[u.scopeMode])]), 0, 0, 420, 350);
    frame('scopeKnob', 100, 100);
    target('scopeKnob', 'scope-tune', knobLabel('scope-tune', u), 0, 0, 100, 100);
    frame('scopeRateKnob', 100, 100);
    target('scopeRateKnob', 'scope-rate', knobLabel('scope-rate', u), 0, 0, 100, 100);
    frame('scopePersistenceKnob', 100, 100);
    target('scopePersistenceKnob', 'scope-persist', knobLabel('scope-persist', u), 0, 0, 100, 100);
    const cl = frame('clock', 520, 218, '#111a17');
    const running = u.powerOn && hasGame && !['round_result', 'game_over'].includes(s.phase);
    const seconds = Math.max(0, Math.floor(u.seconds));
    const timer = running ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}${String(seconds % 60).padStart(2, '0')}` : '----';
    const glow = u.powerOn ? running ? seconds <= 15 ? '#ed8960' : '#efb663' : '#65563a' : '#252b21';
    [34, 141, 288, 395].forEach((x, i) => segmentDigit(cl, timer[i], x, 25, glow));
    cl.fillStyle = glow;
    cl.fillRect(257, 61, 10, 10); cl.fillRect(257, 111, 10, 10);
    line(cl, 34, 174, 446, '#3b4030');
    text(cl, running ? t("阶段余时 · 约") : t("等待行动"), 34, 199, 22, u.powerOn ? '#a39b79' : '#4b483a');
    for (let i = 0; i < 5; i++) {
        const k = frame('key' + i, 180, 200);
        const enabled = r.guess && r.active && s.connected && s.connected && !s.recovering && !u.rosterOpen && !u.manual;
        text(k, i === 4 ? '←' : String(i + 1), i === 4 ? 27 : 53, 101, 96, enabled ? CREAM : '#84908c', 500);
        target('key' + i, 'key-' + i, i === 4 ? t("删除上一位") : t("输入数字 {0}", [i + 1]), 0, 0, 180, 200, { disabled: !enabled });
    }
    const ph = frame('phase', 550, 214);
    [t("加密"), t("拦截"), t("解码")].forEach((label, i) => {
        const active = u.powerOn && s.phase === ['encrypting', 'intercept', 'decrypt'][i];
        text(ph, `0${i + 1}`, 23 + i * 177, 28, 18, u.powerOn ? '#a2a492' : '#4b4e42', 500);
        fitLabel(ph, label, 23 + i * 177, 79, 29, active ? r.color : u.powerOn ? '#a2a492' : '#4b4e42', 400, 148);
        ph.fillStyle = active ? r.color : '#1b2a32';
        round(ph, 25 + i * 177, 129, 104, 17, 8);
        ph.fill();
        if (i < 2) text(ph, '›', 152 + i * 177, 78, 28, u.powerOn ? '#7b857c' : '#3e453d');
    });
    text(ph, s.phase === 'home' || s.phase === 'room' ? t("等待行动开始") : t("第 {0} / 16 回合", [s.round]), 24, 190, 21, u.powerOn ? '#bbc0aa' : '#4b4e42');
    const tr = frame('transmitLabel', 600, 164);
    const homeReady = s.phase === 'home' && !!u.name.trim() && (u.mode === 'create' || u.code.length === 4) && s.connected;
    const lobbyReady = s.phase === 'room' && s.canStart && s.ownerID === s.myPlayerID && s.connected;
    const ready = !!(r.ready || homeReady || lobbyReady || s.phase === 'game_over') && s.connected && !s.recovering && !u.rosterOpen && !u.manual;
    const transmitText = s.phase === 'home' ? u.mode === 'create' ? t("建立频道") : t("接入频道") : s.phase === 'room' ? t("开始行动") : s.phase === 'game_over' ? t("返回通信局") : u.submitted ? t("已发送") : t("发报 · 确认");
    const command = 'ACTION';
    tr.textAlign = 'center';
    tr.letterSpacing = '7px';
    text(tr, command, 304, 60, command.length > 6 ? 78 : 91, '#e9ddc2', 700);
    tr.letterSpacing = '3px';
    text(tr, 'PRESS TO CONFIRM', 302, 135, 25, '#e9ddc2', 500);
    frame('transmitControl', 600, 260);
    target('transmitControl', 'transmit', transmitText, 0, 0, 600, 260, { disabled: !ready });
    const dl = frame('disklabel', 300, 100);
    text(dl, 'KEY / 01', 16, 51, 37, INK, 600);
    text(dl, 'DECRYPTO', 17, 85, 19, '#817c70');
    frame('powerControl', 320, 180);
    target('powerControl', 'power-toggle', u.powerOn ? t("关闭终端电源") : t("开启终端电源"), 0, 0, 320, 180);
    const ft = frame('footer', 1100, 65);
    text(ft, 'NETWORK', 350, 32, 29, '#355b45');
    text(ft, 'UNOFFICIAL EDITION', 770, 32, 18, '#817c70');
    frame('batteryControl', 100, 100);
    target('batteryControl', 'battery-toggle', u.batteryOpen ? t("合上电池仓盖") : t("掀开电池仓盖，查看四节电池"), 0, 0, 100, 100);
    frame('soundControl', 100, 100);
    target('soundControl', 'sound-toggle', u.soundOn ? t("关闭机械音效") : t("开启机械音效并试听喇叭"), 0, 0, 100, 100);
    frame('testControl', 100, 100);
    target('testControl', 'lamp-test', t("本机灯光自检，不改变对局连接"), 0, 0, 100, 100);
    const rearControls = new Set(['battery-toggle', 'sound-toggle', 'lamp-test']);
    for (let i = 0; i < 4; i++) {
        const name = `batteryCell${i}Control`, id = `battery-cell-${i}`;
        frame(name, 100, 300);
        if (u.batteryOpen) target(name, id, t("{0}第 {1} 节电池", [u.removedBatteries & (1 << i) ? t("装回") : t("取出"), i + 1]), 0, 0, 100, 300);
        rearControls.add(id);
    }
    ['RJ45', 'Serial', 'DC'].forEach((name, i) => {
        const surface = `${name}PlugControl`, id = `cable-plug-${i}`;
        frame(surface, 180, 100);
        target(surface, id, `${u.unpluggedCables & (1 << i) ? t("插回") : t("拔出")}${[t("网线"), t("串口线"), t("电源线")][i]}`, 0, 0, 180, 100);
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
    for (const name of ['screen', 'word0', 'word1', 'word2', 'word3']) {
        const { canvas } = frames[name];
        crtFinish(canvas.getContext('2d')!, canvas.width, canvas.height, name.startsWith('word'));
    }
    if (!u.powerOn) {
        for (const name of ['screen', 'word0', 'word1', 'word2', 'word3', 'channel']) {
            const { canvas } = frames[name];
            const display = canvas.getContext('2d')!;
            display.setTransform(1, 0, 0, 1, 0, 0);
            display.clearRect(0, 0, canvas.width, canvas.height);
            display.fillStyle = name.startsWith('word') ? '#160805' : '#0b1313';
            display.fillRect(0, 0, canvas.width, canvas.height);
        }
        for (const name of Object.keys(lamps)) lamps[name] = false;
    }
    return { frames, connected: s.connected, targets: targets.filter(t => rearControls.has(t.id) === u.backView &&
            (u.powerOn || u.backView || t.id === 'power-toggle')),
        status: !u.powerOn ? t("终端已关闭；对局继续进行，按电源恢复。") : status || `${t(({ home: '通信局', room: '队伍准备', encrypting: '加密', intercept: '拦截', decrypt: '解码', round_result: '本轮回执', game_over: '行动结束' })[s.phase])} · ${s.connected ? t("已连接") : t("连接中")}`,
        tint, waiting, ready: ready && u.powerOn, lamps, seats, roomCode: u.powerOn ? s.roomCode || '' : '',
        paperRecords: records.length, activity: u.powerOn ? activity : 0 };
}
