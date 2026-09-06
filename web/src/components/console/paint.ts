import { archiveRows, archiveStart, roleState, word, resultTint } from './model';
import type { LocalState, StationState } from './model';
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
    tint: string;
    waiting: boolean;
    ready: boolean;
}
const INK = '#243344', CREAM = '#ece0c4', MUTED = '#a59e8c', DARK = '#111e24';
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
export function paint(s: StationState, u: LocalState): Content {
    const frames: Record<string, Frame> = {};
    const targets: Target[] = [];
    const r = roleState(s, u);
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
            round(c, 0, 0, width, height, name === 'screen' ? 42 : 12);
            c.fill();
        }
        frames[name] = { canvas, width, height };
        return c;
    }
    function target(surface: string, id: string, label: string, x: number, y: number, w: number, h: number, options: Partial<Target> = {}) {
        targets.push({ surface, id, label, x, y, w, h, ...options });
        if (u.focus === id && !options.disabled) {
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
    const w = u.archiveOpen ? 760 : 1000;
    const right = w - 55;
    const status = s.error || u.note || (u.submitted ? '密报已发送，等待服务器确认。' : '');
    text(c, hasGame ? `第 ${String(s.round).padStart(2, '0')} 回合` : 'DECRYPTO  /  通信局', 55, 49, 19, tint, 500);
    button(c, 'manual', u.manual ? '返回' : '手册', right - 75, 28, 75, 39);
    if (u.manual) {
        text(c, '让队友听懂，让对手迷失。', 55, 113, 34, tint, 600);
        const rules = ['每队至少两人，可以由 AI 补位。', '四个秘密词对应编号 1–4，词窗仅我方可见。', '加密者按三位密码顺序，各写一条关联线索。', '对手先拦截，再由队友解码；前两回合跳过拦截。', '截获两次，或对方解码失误两次，即获胜。', '数字键选择密码，退格删除；拉下发报杆确认。', '点击纸带放大对照，滚轮翻页，A/B 切换档案。'];
        rules.forEach((t, i) => wrap(c, t, 55, 181 + i * 47, w - 110, 21, CREAM, 2));
        text(c, '线上版最多 16 回合；截获成功会结束该回合。', 55, 537, 18, MUTED, 400, w - 110);
    }
    else if (s.phase === 'home') {
        text(c, '接通你的秘密频道。', 55, 118, 43, tint, 600);
        text(c, '同样的线索，不同的秘密。', 55, 169, 24, MUTED);
        button(c, 'mode-create', '建立频道', 55, 212, 180, 47, false, u.mode === 'create');
        button(c, 'mode-join', '加入频道', 246, 212, 180, 47, false, u.mode === 'join');
        text(c, '特工代号', 55, 296, 21, tint);
        field('name', u.name, '输入你的昵称', 55, 320, w - 110, 61, 20);
        if (u.mode === 'join') {
            text(c, '四位频道编号', 55, 413, 21, tint);
            field('code', u.code, '例如 A1B2', 55, 437, w - 110, 61, 4);
        }
        else {
            text(c, '4–8 位玩家 · 支持 AI 队友', 55, 437, 23, CREAM);
            text(c, '填写代号后，拉下右侧发报杆建立频道。', 55, 485, 21, MUTED, 400, w - 110);
        }
    }
    else if (s.phase === 'room') {
        text(c, `频道 ${s.roomCode ?? '—'} · 集合`, 55, 111, 36, tint, 600);
        button(c, 'copy-code', '复制频道', right - 134, 84, 134, 47);
        text(c, '选择队伍，房主可添加 AI。每队至少两人。', 55, 166, 22, MUTED, 400, w - 110);
        const owner = s.ownerID === s.myPlayerID;
        const col = (w - 132) / 2;
        ['A', 'B'].forEach((team, j) => {
            const x = 55 + j * (col + 22), people = team === 'A' ? s.teamA : s.teamB;
            text(c, `${team} 队  /  ${people.length} 人`, x, 215, 27, team === 'A' ? '#9fbfd1' : '#e8a28c', 600);
            line(c, x, 244, col);
            people.slice(0, 4).forEach((p, i) => {
                text(c, `${p.nickname}${p.id === s.myPlayerID ? ' · 你' : ''}`, x, 276 + i * 39, 22, CREAM, 400, col - 55);
                if (owner && p.is_ai)
                    button(c, `remove-${team}-${i}`, '×', x + col - 38, 259 + i * 39, 38, 32);
            });
            const joined = people.some(p => p.id === s.myPlayerID);
            button(c, `team-${team}`, joined ? '离开此队' : '加入此队', x, 451, col * .59, 47, !s.connected || (!joined && people.length >= 4), joined);
            if (owner)
                button(c, `ai-${team}`, '+ AI', x + col * .62, 451, col * .38, 47, people.length >= 4 || !s.connected);
        });
        text(c, owner ? s.canStart ? '人员就绪，拉下发报杆开始行动。' : '等待人员就绪…' : '等待房主开始行动。', 55, 535, 22, tint, 400, w - 110);
    }
    else if (s.phase === 'round_result' || s.phase === 'game_over') {
        const final = s.phase === 'game_over';
        const title = final ? s.gameOver?.winner ? `${s.gameOver.winner} 队获胜` : '双方平局' :
            s.roundResult?.decrypt_success !== undefined ? s.roundResult.decrypt_success ? '解码成功' : '解码失误' :
                s.roundResult?.intercept_success ? '密报被截获' : '拦截未成功';
        text(c, final ? '行动结束' : '本轮回执', 55, 123, 25, tint);
        text(c, title, 55, 221, 59, tint, 600);
        wrap(c, final ? '每句看似普通的话，都藏着一场交锋。' : s.roundResult?.intercept_success === false && s.roundResult.decrypt_success === undefined ? '即将进入解码阶段。' : '结果已记录，等待下一轮通信。', 55, 304, w - 110, 25);
        ['A', 'B'].forEach((team, i) => {
            const score = team === 'A' ? s.scoreA : s.scoreB;
            text(c, `${team} 队     截获 ${score.interceptions} / 2     失误 ${score.decrypt_failures} / 2`, 55, 408 + i * 57, 27, CREAM);
        });
        if (final)
            text(c, '拉下发报杆返回通信局；纸带仍可翻阅。', 55, 539, 21, MUTED, 400, w - 110);
    }
    else {
        const title = u.submitted ? '密报已发送' : r.encrypt ? '你的回合 · 加密' : r.guess ? s.phase === 'intercept' ? '截获对方密报' : '解读队友线索' : s.phase === 'encrypting' ? '等待加密者发报' : s.phase === 'intercept' ? '对方正在拦截' : '等待队友解码';
        text(c, title, 55, 113, w < 900 ? 33 : 42, tint, 600);
        const description = r.encrypt ? '按密码顺序写下三条线索，让队友读懂。' : r.guess ? '对照线索与档案，选择三个不同的编号。' : s.encryptor ? `本轮加密者：${s.encryptor}` : '留意通信信号，可以随时翻阅档案。';
        text(c, description, 55, 166, 22, MUTED, 400, w - 110);
        [0, 1, 2].forEach(i => {
            const y = 211 + i * 91;
            c.strokeStyle = (u.focus === `clue-${i}` || r.guess && u.slot === i) ? tint : '#5b5842';
            c.lineWidth = 1.6;
            round(c, 55, y, w - 110, 75, 9);
            c.stroke();
            if (r.encrypt) {
                text(c, String(s.secretDigits[i] ?? '—'), 75, y + 38, 38, tint, 600);
                text(c, word(s.secretWords[i] || s.myWords[(s.secretDigits[i] ?? 1) - 1]), 126, y + 38, 25, tint, 500, 130);
                line(c, 267, y + 17, 0);
                c.fillStyle = '#504c37';
                c.fillRect(267, y + 16, 1, 43);
                text(c, u.clues[i] || '写下关联线索…', 288, y + 38, 25, u.clues[i] ? CREAM : '#7e8278', 400, w - 372);
                target('screen', `clue-${i}`, `第 ${i + 1} 条线索`, 277, y + 3, w - 336, 69, { kind: 'input', value: u.clues[i], maxLength: 40, disabled: !r.active || !s.connected });
                if (u.focus === `clue-${i}` && !u.clues[i]) {
                    c.fillStyle = tint;
                    c.fillRect(288, y + 23, 2, 29);
                }
            }
            else {
                text(c, `0${i + 1}`, 75, y + 38, 24, MUTED);
                text(c, s.clues[i] || '等待线索…', 134, y + 38, 28, s.clues[i] ? CREAM : MUTED, 500, w - 330);
                if (r.guess) {
                    text(c, String(u.guess[i] || '—'), w - 121, y + 38, 36, tint, 600);
                    target('screen', `slot-${i}`, `选择第 ${i + 1} 位密码`, 55, y, w - 110, 75, { disabled: !r.active });
                }
                else if (s.playerProgress && s.playerProgress.step > i) {
                    text(c, '已完成', w - 147, y + 38, 19, tint);
                }
            }
        });
        const progress = s.playerProgress || s.aiStatus;
        const foot = u.submitted ? '已提交，等待其他玩家。' : r.active ? r.encrypt ? `已填写 ${u.clues.filter(v => v.trim()).length} / 3 · 拉下右侧发报杆提交` : `当前密码  ${u.guess.map(n => n || '—').join(' · ')} · 发报杆确认` : progress ? `${progress.player} · 已完成 ${progress.step} / ${progress.total}` : '链路已接通 · 等待信号';
        text(c, foot, 55, 525, 21, tint, 400, w - 110);
    }
    if (status) {
        c.fillStyle = '#432c28';
        round(c, 42, 548, w - 84, 35, 6);
        c.fill();
        text(c, status, 54, 565, 18, '#ffd0b4', 400, w - 109);
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
        target('screen', id, id === 'name' ? '特工代号' : '四位频道编号', x, y, width, height, { kind: 'input', value, maxLength, disabled: !s.connected });
    }
    for (let i = 0; i < 4; i++) {
        const g = frame('word' + i, 480, 284, '#360a06');
        const grad = g.createLinearGradient(0, 0, 0, 284);
        grad.addColorStop(0, 'rgba(196,40,16,.24)');
        grad.addColorStop(.6, 'rgba(80,9,5,0)');
        grad.addColorStop(1, 'rgba(201,42,15,.19)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 480, 284);
        for (let x = 25; x < 480; x += 40)
            line(g, x, 0, 0);
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
        text(g, String(i + 1), 27, 127, 83, '#ed7653', 600);
        text(g, u.hiddenWords ? '••••' : word(s.myWords[i]) || '待载入', 119, 128, 68, '#f4b07f', 600, 330);
        text(g, hasGame ? '仅我方可见' : '插入密钥后载入', 123, 201, 20, '#ba6750');
        target('word' + i, 'words', u.hiddenWords ? '显示秘密词' : '遮住秘密词', 0, 0, 480, 284);
    }
    const b = frame('badge', 600, 316);
    text(b, 'D /', 115, 105, 123, INK, 700);
    text(b, '通 信 局', 132, 205, 35, INK, 600);
    target('badge', 'manual', '行动手册', 0, 0, 600, 316);
    const ro = frame('roster', 400, 815);
    ['A', 'B'].forEach((team, k) => {
        const people = team === 'A' ? s.teamA : s.teamB;
        const y = k * 408;
        ro.fillStyle = team === 'A' ? '#2f4b61' : '#8b3c2e';
        round(ro, 0, y, 400, 64, 6);
        ro.fill();
        text(ro, `${team} 队${s.myTeam === team ? ' · 我方' : ''}`, 20, y + 32, 31, CREAM, 600);
        Array.from({ length: 4 }, (_, i) => {
            const p = people[i];
            const yy = y + 107 + i * 77;
            text(ro, p ? (p.id === s.myPlayerID ? '你' : p.nickname) : '空席', 21, yy, 34, p ? INK : '#8d8678', p?.id === s.myPlayerID ? 600 : 400, 288);
            ro.fillStyle = p ? (p.nickname === s.encryptor ? tint : '#628268') : '#a59d8e';
            ro.beginPath();
            ro.arc(353, yy, 7, 0, Math.PI * 2);
            ro.fill();
            line(ro, 17, yy + 34, 363, '#b4ac9b');
        });
    });
    const br = frame('brand', 740, 220);
    text(br, 'D E C R Y P T O', 51, 68, 51, INK, 600);
    text(br, `CHANNEL  ${s.roomCode || '— — — —'}`, 139, 155, 29, INK, 500);
    target('brand', 'copy-code', '复制频道编号', 0, 0, 740, 220, { disabled: !s.roomCode });
    const sc = frame('score', 600, 357, '#19272e');
    text(sc, '截获', 175, 53, 31, CREAM);
    text(sc, '失误', 405, 53, 31, CREAM);
    ['A', 'B'].forEach((team, i) => {
        const score = team === 'A' ? s.scoreA : s.scoreB;
        const yy = 143 + i * 129;
        text(sc, team, 38, yy, 44, CREAM, 600);
        [score.interceptions, score.decrypt_failures].forEach((n, j) => {
            for (let k = 0; k < 2; k++) {
                const x = 187 + j * 227 + k * 76;
                sc.beginPath();
                sc.arc(x, yy, 22, 0, Math.PI * 2);
                sc.fillStyle = k < n ? j ? '#dd6950' : '#f2b750' : '#0d171b';
                sc.fill();
                sc.strokeStyle = k < n ? '#f5c78a' : '#7d7966';
                sc.lineWidth = 3;
                sc.stroke();
            }
        });
    });
    const al = frame('archiveLabel', 700, 78);
    text(al, '密 报 记 录', 167, 39, 35, INK, 500);
    const pp = frame('paper', 700, 920, '#e8dcc1');
    const rows = archiveRows(s, u.archiveTeam);
    const per = 2;
    const start = archiveStart(s, u);
    const page = Math.floor(start / per);
    if (!u.archiveOpen)
        text(pp, `档案 / ${u.archiveTeam === 'all' ? '全部' : u.archiveTeam + ' 队'}`, 45, 48, 38, INK, 600);
    if (!rows.length) {
        text(pp, '频道暂时安静。', 45, 167, 36, INK, 500);
        wrap(pp, hasGame ? '已完成回合的线索与公开密码将在下一回合归档。' : '接入频道后，这里会记录每一次密报。', 45, 245, 604, 29, '#6c685d', 5);
        text(pp, '滚动翻阅 · 点击纸面放大', 45, 782, 26, '#6c685d');
    }
    else {
        rows.slice(start, start + per).forEach((row, i) => {
            const y = 113 + i * 356;
            text(pp, `第 ${String(row.round).padStart(2, '0')} 回合 · ${row.team} 队`, 45, y, 43, INK, 600);
            row.clues.slice(0, 3).forEach((cl, j) => text(pp, `${j + 1}  ${cl}`, 45, y + 58 + j * 48, 43, INK, 400, 602));
            text(pp, `密码  ${row.secret?.join(' · ') || '尚未公开'}`, 45, y + 209, 38, INK, 600);
            if (u.archiveOpen)
                text(pp, `截获 ${row.intercept?.some(Boolean) ? row.intercept.join('·') : '—'}   解码 ${row.decrypt?.some(Boolean) ? row.decrypt.join('·') : '—'}`, 45, y + 252, 28, '#625d50');
            line(pp, 45, y + (u.archiveOpen ? 264 : 255), 600, '#b9ac91');
        });
        if (!u.archiveOpen)
            text(pp, `${page + 1} / ${Math.max(1, Math.ceil(rows.length / per))}   点击放大`, 45, 865, 36, '#686051');
    }
    target('paper', 'archive-toggle', u.archiveOpen ? '收起历史对照' : '放大历史对照', 0, 0, 700, 920);
    if (u.archiveOpen) {
        ['all', 'A', 'B'].forEach((team, i) => target('paper', 'filter-' + team, team === 'all' ? '全部历史' : `${team} 队历史`, 30 + i * 150, 8, 140, 76));
        ['全部', 'A 队', 'B 队'].forEach((label, i) => text(pp, label, 35 + i * 150, 45, 35, u.archiveTeam === ['all', 'A', 'B'][i] ? '#a23d2d' : INK, 600));
        text(pp, '收起 ×', 540, 45, 32, INK);
        target('paper', 'archive-close', '收起纸带', 520, 5, 175, 76);
        text(pp, '‹ 上页', 35, 859, 33, INK);
        text(pp, `${page + 1} / ${Math.max(1, Math.ceil(rows.length / per))}`, 295, 859, 31, INK);
        text(pp, '下页 ›', 532, 859, 33, INK);
        target('paper', 'archive-prev', '对照记录上一页', 15, 815, 225, 91, { disabled: start === 0 });
        target('paper', 'archive-next', '对照记录下一页', 470, 815, 225, 91, { disabled: start + per >= rows.length });
    }
    const ac = frame('archiveControls', 700, 65);
    text(ac, '‹ 上页', 12, 31, 30, INK);
    text(ac, '最新', 279, 31, 30, INK);
    text(ac, '下页 ›', 519, 31, 30, INK);
    target('archiveControls', 'archive-prev', '历史上一页', 0, 0, 225, 65, { disabled: start === 0 });
    target('archiveControls', 'archive-latest', '最新记录', 225, 0, 230, 65);
    target('archiveControls', 'archive-next', '历史下一页', 455, 0, 245, 65, { disabled: start + per >= rows.length });
    frame('wheel', 100, 140);
    target('wheel', 'archive-prev', '滚轮向上翻阅', 0, 0, 100, 70, { disabled: start === 0 });
    target('wheel', 'archive-next', '滚轮向下翻阅', 0, 70, 100, 70, { disabled: start + per >= rows.length });
    const cl = frame('clock', 520, 218, '#152128');
    const timer = hasGame && !['round_result', 'game_over'].includes(s.phase) ? `${String(Math.floor(u.seconds / 60)).padStart(2, '0')}:${String(u.seconds % 60).padStart(2, '0')}` : '— — : — —';
    text(cl, timer, 25, 106, 99, u.seconds <= 15 && hasGame ? '#ef9979' : '#f1bc62', 500);
    text(cl, hasGame ? '阶段余时 · 约' : '等待接入', 29, 189, 25, '#ad9e7b');
    for (let i = 0; i < 5; i++) {
        const k = frame('key' + i, 180, 200);
        text(k, i === 4 ? '←' : String(i + 1), i === 4 ? 27 : 53, 101, 96, r.guess && r.active ? CREAM : '#84908c', 500);
        target('key' + i, 'key-' + i, i === 4 ? '删除上一位' : `输入数字 ${i + 1}`, 0, 0, 180, 200, { disabled: !r.guess || !r.active || !s.connected });
    }
    const ph = frame('phase', 550, 214);
    ['加密', '拦截', '解码'].forEach((label, i) => {
        const active = s.phase === ['encrypting', 'intercept', 'decrypt'][i];
        text(ph, label, 23 + i * 177, 56, 34, active ? r.color : '#a2a492');
        ph.fillStyle = active ? r.color : '#1b2a32';
        round(ph, 25 + i * 177, 129, 104, 17, 8);
        ph.fill();
    });
    const tr = frame('transmitLabel', 700, 87);
    const homeReady = s.phase === 'home' && !!u.name.trim() && (u.mode === 'create' || u.code.length === 4) && s.connected;
    const lobbyReady = s.phase === 'room' && s.canStart && s.ownerID === s.myPlayerID && s.connected;
    const ready = !!(r.ready || homeReady || lobbyReady || s.phase === 'game_over');
    const transmitText = s.phase === 'home' ? u.mode === 'create' ? '建立频道' : '接入频道' : s.phase === 'room' ? '开始行动' : s.phase === 'game_over' ? '返回通信局' : u.submitted ? '已发送' : '发报 · 确认';
    text(tr, transmitText, 125, 43, 37, ready ? '#9b3725' : INK, 600);
    target('transmitLabel', 'transmit', transmitText, 0, -260, 700, 360, { disabled: !ready });
    const dl = frame('disklabel', 300, 100);
    text(dl, '密 钥 / 01', 16, 51, 37, INK, 600);
    text(dl, 'DECRYPTO', 17, 85, 19, '#817c70');
    const po = frame('power', 100, 130);
    text(po, 'I', 37, 46, 41, CREAM);
    text(po, 'O', 32, 98, 30, CREAM);
    const ft = frame('footer', 1100, 65);
    text(ft, s.connected ? '链路已接通' : '正在连接…', 286, 32, 37, s.connected ? '#355b45' : '#865135');
    text(ft, '电源', 7, 32, 36, INK);
    text(ft, '非官方线上演绎', 770, 32, 23, '#817c70');
    return { frames, targets, status: status || `${s.phase} · ${s.connected ? '已连接' : '连接中'}`, tint, waiting, ready };
}
