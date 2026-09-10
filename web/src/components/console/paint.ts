import { roleState, rosterTeams, word, resultTint, scopeModes, scopeRates, scopePersistenceModes } from './model';
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
    lamps: Record<string, boolean>;
    seats: Record<string, boolean>;
    activity: number;
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
export function paint(s: StationState, u: LocalState): Content {
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
            round(c, 0, 0, width, height, name === 'screen' ? 42 : 12);
            c.fill();
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
    const status = s.error || u.note || (u.submitted ? '密报已发送，等待服务器确认。' : '');
    text(c, hasGame ? `第 ${String(s.round).padStart(2, '0')} 回合` : 'DECRYPTO  /  通信局', 55, 49, 19, tint, 500);
    text(c, s.roomCode ? `CH ${s.roomCode}  /  ${s.myTeam ? s.myTeam + ' 队' : '待编组'}  /  ${s.connected ? '已接通' : '连接中'}` : '双队通信  /  4–8 人', 500, 49, 16, MUTED, 400, 338);
    button(c, 'manual', u.manual ? '返回' : '手册', right - 75, 28, 75, 39);
    if (u.rosterOpen) {
        text(c, '频道人员 · 值勤名册', 55, 112, 36, tint, 600);
        button(c, 'roster-toggle', '返回操作', 799, 88, 146, 47);
        text(c, s.phase === 'home' ? '建立或加入频道后，在这里查看队伍与当前行动。' : `频道 ${s.roomCode} · ${s.teamA.length + s.teamB.length} 人已编组 · 每队 2–4 人`, 55, 164, 21, MUTED, 400, 890);
        teams.forEach((team, j) => {
            const x = 55 + j * 457;
            text(c, `${team.team} 队${team.own ? ' / 我方' : ''}`, x, 215, 27, teamLight(team.team), 600);
            text(c, team.summary, x + 252, 215, 20, teamLight(team.team));
            line(c, x, 240, 430, '#45514d');
            team.seats.forEach((seat, i) => {
                const y = 252 + i * 64;
                if (seat.player) {
                    portrait(c, x, y + 6, 45, seat.player.is_ai, teamInk(team.team));
                    const name = seat.player.nickname;
                    c.font = `500 25px ${FONT}`;
                    const nameSize = Math.max(16, Math.min(25, 25 * 350 / Math.max(1, c.measureText(name).width)));
                    text(c, name, x + 58, y + 16, nameSize, CREAM, 500, 350);
                    text(c, `${seat.code}${seat.self ? ' · 你' : ''} · ${seat.player.is_ai ? 'AI' : '真人'}${seat.owner ? ' · 房主' : ''} · ${seat.status}${seat.progress ? ` ${seat.progress.step}/${seat.progress.total}` : ''}`, x + 58, y + 44, 18, seat.acting ? tint : MUTED, 400, 350);
                } else {
                    text(c, '+', x + 12, y + 25, 29, MUTED);
                    text(c, `${seat.code}  空席`, x + 58, y + 16, 23, MUTED);
                    text(c, seat.status, x + 58, y + 44, 18, MUTED);
                }
                line(c, x, y + 61, 430, '#2c3a3b');
            });
        });
        const unassigned = s.players.filter(p => ![...s.teamA, ...s.teamB].some(member => member.id === p.id)).length;
        text(c, unassigned ? `${unassigned} 人尚未选择队伍 · 在集合界面加入 A 队或 B 队` : '姓名牌标记当前行动 · 点击左侧名册收起', 55, 532, 20, tint, 400, 890);
    }
    else if (u.manual) {
        text(c, '让队友听懂，让对手迷失。', 55, 113, 34, tint, 600);
        const rules = ['每队至少两人，可以由 AI 补位。', '四个秘密词对应编号 1–4，词窗仅我方可见。', '加密者按三位密码顺序，各写一条关联线索。', '对手先拦截，再由队友解码；前两回合跳过拦截。', '截获两次，或对方解码失误两次，即获胜。', '数字键选择密码，退格删除；按下红色发报键确认。', '点击纸带抽出档案，按队伍对照并写私人笔记。'];
        rules.forEach((t, i) => wrap(c, t, 55, 181 + i * 47, w - 110, 21, CREAM, 2));
        text(c, '线上版最多 16 回合；截获成功会结束该回合。', 55, 537, 18, MUTED, 400, w - 110);
    }
    else if (s.phase === 'home') {
        text(c, '接通你的秘密频道。', 55, 118, 43, tint, 600);
        text(c, '同样的线索，不同的秘密。', 55, 169, 24, MUTED);
        button(c, 'mode-create', '建立频道', 55, 212, 180, 47, false, u.mode === 'create');
        button(c, 'mode-join', '加入频道', 246, 212, 180, 47, false, u.mode === 'join');
        text(c, '编组  →  加密  →  破译', 615, 236, 20, MUTED);
        text(c, '特工代号', 55, 296, 21, tint);
        field('name', u.name, '输入你的昵称', 55, 320, w - 110, 61, 20);
        if (u.mode === 'join') {
            text(c, '四位频道编号', 55, 413, 21, tint);
            field('code', u.code, '例如 A1B2', 55, 437, w - 110, 61, 4);
        }
        else {
            text(c, '4–8 位玩家 · 支持 AI 队友', 55, 437, 23, CREAM);
            text(c, '填写代号后，按下右侧红键建立频道。', 55, 485, 21, MUTED, 400, w - 110);
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
            Array.from({ length: 4 }, (_, i) => {
                const p = people[i], y = 254 + i * 46;
                if (p) {
                    portrait(c, x, y + 4, 33, p.is_ai, teamInk(team));
                    text(c, `${p.nickname}${p.id === s.myPlayerID ? ' · 你' : ''}`, x + 45, y + 20, 23, CREAM, 500, col - 178);
                    text(c, p.id === s.ownerID ? '房主' : p.is_ai ? 'AI' : '真人', x + col - 123, y + 21, 17, MUTED);
                    if (owner && p.is_ai)
                        button(c, `remove-${team}-${i}`, '×', x + col - 38, y + 4, 38, 32);
                } else {
                    text(c, '+', x + 6, y + 21, 25, MUTED);
                    text(c, `空席 ${team}${i + 1} · 等待好友或 AI`, x + 45, y + 21, 19, MUTED, 400, col - 50);
                }
                line(c, x, y + 43, col, '#2e3d3d');
            });
            const joined = people.some(p => p.id === s.myPlayerID);
            button(c, `team-${team}`, joined ? '离开此队' : '加入此队', x, 451, col * .59, 47, !s.connected || (!joined && people.length >= 4), joined);
            if (owner)
                button(c, `ai-${team}`, '+ AI', x + col * .62, 451, col * .38, 47, people.length >= 4 || !s.connected);
        });
        text(c, owner ? s.canStart ? '人员就绪，按下红键开始行动。' : '等待人员就绪…' : '等待房主开始行动。', 55, 535, 22, tint, 400, w - 110);
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
            text(c, '按下红键返回通信局；纸带仍可翻阅。', 55, 539, 21, MUTED, 400, w - 110);
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
        const foot = u.submitted ? '已提交，等待其他玩家。' : r.active ? r.encrypt ? `已填写 ${u.clues.filter(v => v.trim()).length} / 3 · 按下右侧红键提交` : `当前密码  ${u.guess.map(n => n || '—').join(' · ')} · 按下红键确认` : progress ? `${progress.player} · 已完成 ${progress.step} / ${progress.total}` : '链路已接通 · 等待信号';
        text(c, foot, 55, 525, 21, tint, 400, w - 110);
    }
    if (status) {
        c.fillStyle = '#432c28';
        round(c, 42, 548, w - 84, 35, 6);
        c.fill();
        text(c, status, 54, 565, 18, '#ffd0b4', 400, w - 109);
    } else {
        line(c, 55, 558, 890, '#34423f');
        text(c, hasGame ? '密钥仅我方可见' : '每条线索，都是一次试探。', 55, 577, 14, MUTED);
        text(c, u.rosterOpen ? 'PERSONNEL / 值勤记录' : u.manual ? 'FIELD GUIDE / 行动手册' : 'D / FIELD COMMUNICATIONS', 662, 577, 13, MUTED);
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
        text(g, `KEY / 0${i + 1}`, 26, 31, 17, '#c67d5e', 500);
        line(g, 26, 55, 426, '#99513a');
        text(g, String(i + 1), 27, 127, 83, '#ed7653', 600);
        text(g, !hasGame ? s.phase === 'room' ? '待开局' : '待接入' : u.hiddenWords ? '••••' : word(s.myWords[i]) || '待载入', 119, 128, 68, '#f4b07f', 600, 330);
        text(g, hasGame ? '仅我方可见' : '开局后分配秘密词', 123, 201, 20, '#ba6750');
        line(g, 26, 237, 426, '#99513a');
        text(g, !hasGame ? '编号固定 / 每局重新分配' : u.hiddenWords ? '● 已遮住 · 点击显示' : '● 私密词窗 · 点击遮住', 123, 259, 16, '#c67d5e');
        target('word' + i, 'words', u.hiddenWords ? '显示秘密词' : '遮住秘密词', 0, 0, 480, 284, { disabled: !hasGame });
    }
    const b = frame('badge', 600, 132);
    b.textAlign = 'center';
    text(b, u.manual ? '返回操作' : '行动手册', 300, 66, 76, INK, 600);
    // The hit area follows the complete keycap around the smaller ivory inset.
    target('badge', 'manual', u.manual ? '返回操作' : '查看行动手册', -92, -64, 784, 260);
    // Only ink lives in these textures. Blender owns each card, channel and clip.
    const ro = frame('roster', 800, 1630);
    ro.scale(2, 2);
    frames.roster.width = 400; frames.roster.height = 815;
    text(ro, '值 勤 名 册', 24, 32, 25, CREAM, 600);
    text(ro, '展开 ↗', 288, 33, 18, '#cbbd9f');
    line(ro, 22, 55, 356, '#657165');
    teams.forEach(team => {
        const accent = teamInk(team.team);
        const plaque = frame('roster' + team.team, 728, 96);
        plaque.scale(2, 2);
        text(plaque, `${team.team} 队${team.own ? ' / 我方' : ''}`, 14, 25, 27, CREAM, 600);
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
                    text(card, seat.self ? '你' : '发报', seat.self ? 309 : 302, 20, 17, CREAM, 600);
                }
                text(card, `${seat.code} · ${p.is_ai ? 'AI' : '真人'}${seat.owner ? ' · 房主' : ''}`, 20, 45, 16, '#655c46', 500, 228);
                text(card, seat.status, 263, 45, 17, accent, seat.acting ? 600 : 400, 81);
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
                    text(well, '待入席', 44, 19 + dy, 26, color, 500);
                    text(well, `${seat.code} · ${seat.status}`, 20, 45 + dy, 16, color, 400, 298);
                }
            }
        });
    });
    text(ro, '人员与行动状态  /  点击查看', 65, 802, 15, '#bfb69e');
    target('roster', 'roster-toggle', u.rosterOpen ? '收起队员名册，返回操作' : '查看队员名册与行动状态', 0, 0, 400, 815);
    const channel = frame('channel', 600, 120, '#161d19');
    channel.textAlign = 'center';
    [...(s.roomCode || '————')].slice(0, 4).forEach((digit, i) => {
        text(channel, digit, 75 + i * 150, 62, 81, s.roomCode ? '#e4c98d' : '#697360', 500);
    });
    const copy = frame('channelCopy', 240, 160);
    copy.textAlign = 'center';
    text(copy, '复制', 120, 80, 82, INK, 600);
    target('channelCopy', 'copy-code', '复制房间码', 0, 0, 240, 160, { disabled: !s.roomCode });
    const lamps: Record<string, boolean> = {};
    const sc = frame('score', 600, 357);
    text(sc, '行动计分', 28, 30, 19, '#b4b6a1', 500);
    text(sc, '截获', 182, 65, 29, CREAM);
    text(sc, '失误', 406, 65, 29, CREAM);
    line(sc, 26, 99, 548, '#657568');
    ['A', 'B'].forEach((team, i) => {
        const score = team === 'A' ? s.scoreA : s.scoreB;
        const yy = 153 + i * 103;
        sc.fillStyle = teamInk(team); round(sc, 28, yy - 29, 60, 58, 3); sc.fill();
        text(sc, team, 43, yy, 38, CREAM, 600);
        [score.interceptions, score.decrypt_failures].forEach((n, j) => {
            for (let k = 0; k < 2; k++) {
                lamps[`${team}_${j ? 'failure' : 'intercept'}_${k}`] = k < n;
                text(sc, String(k + 1), 183 + j * 227 + k * 76, yy + 34, 15, '#b1ad96');
            }
        });
        if (i === 0) line(sc, 28, 204, 546, '#3a4a47');
    });
    line(sc, 26, 304, 548, '#657568');
    text(sc, '截获两次获胜 · 失误两次落败', 82, 334, 23, '#c1bca6');
    const leader = frame('paper', 700, 135);
    leader.textAlign = 'center';
    text(leader, '密 报 档 案', 350, 40, 39, '#57513f', 500);
    line(leader, 72, 76, 556, '#aaa08a');
    text(leader, '向 下 抽 出  ↓', 350, 110, 24, '#746b56', 500);
    target('paper', 'archive-toggle', '拉出密报档案与私人笔记', 0, 0, 700, 135);
    const progress = teams.flatMap(team => team.seats).find(seat => seat.acting && seat.progress)?.progress;
    const activity = !hasGame ? 0 : u.submitted ? 1 : r.active ?
        (r.encrypt ? u.clues.filter(value => value.trim()).length : u.guess.filter(Boolean).length) / 3 :
        progress ? Math.max(0, Math.min(1, progress.step / Math.max(1, progress.total))) : 0;
    frame('wheel', 100, 140);
    target('wheel', 'archive-toggle', '抽出密报档案', 0, 0, 100, 140);
    frame('disk', 400, 200);
    target('disk', 'disk-toggle', u.diskOut ? '插入软盘' : '弹出软盘', 0, 0, 400, 200);
    frame('scopeKnob', 100, 100);
    target('scopeKnob', 'scope-tune', '旋转示波器旋钮，当前' + scopeModes[u.scopeMode] + '，点击或拖动调谐', 0, 0, 100, 100);
    frame('scopeRateKnob', 100, 100);
    target('scopeRateKnob', 'scope-rate', '旋转扫描速率旋钮，当前' + scopeRates[u.scopeRate], 0, 0, 100, 100);
    frame('scopePersistenceKnob', 100, 100);
    target('scopePersistenceKnob', 'scope-persist', '旋转余辉旋钮，当前' + scopePersistenceModes[u.scopePersistence], 0, 0, 100, 100);
    const cl = frame('clock', 520, 218, '#152128');
    const timer = hasGame && !['round_result', 'game_over'].includes(s.phase) ? `${String(Math.floor(u.seconds / 60)).padStart(2, '0')}:${String(u.seconds % 60).padStart(2, '0')}` : '––:––';
    text(cl, timer, 25, 106, 99, u.seconds <= 15 && hasGame ? '#ef9979' : '#f1bc62', 500);
    text(cl, hasGame ? '阶段余时 · 约' : '等待接入', 29, 189, 25, '#ad9e7b');
    for (let i = 0; i < 5; i++) {
        const k = frame('key' + i, 180, 200);
        const enabled = r.guess && r.active && s.connected && !u.rosterOpen && !u.manual;
        text(k, i === 4 ? '←' : String(i + 1), i === 4 ? 27 : 53, 101, 96, enabled ? CREAM : '#84908c', 500);
        target('key' + i, 'key-' + i, i === 4 ? '删除上一位' : `输入数字 ${i + 1}`, 0, 0, 180, 200, { disabled: !enabled });
    }
    const ph = frame('phase', 550, 214);
    ['加密', '拦截', '解码'].forEach((label, i) => {
        const active = s.phase === ['encrypting', 'intercept', 'decrypt'][i];
        text(ph, `0${i + 1}`, 23 + i * 177, 28, 18, '#a2a492', 500);
        text(ph, label, 23 + i * 177, 79, 34, active ? r.color : '#a2a492');
        ph.fillStyle = active ? r.color : '#1b2a32';
        round(ph, 25 + i * 177, 129, 104, 17, 8);
        ph.fill();
        if (i < 2) text(ph, '›', 152 + i * 177, 78, 28, '#7b857c');
    });
    text(ph, s.phase === 'home' || s.phase === 'room' ? '等待行动开始' : `第 ${s.round} / 16 回合`, 24, 190, 21, '#bbc0aa');
    const tr = frame('transmitLabel', 600, 82);
    const homeReady = s.phase === 'home' && !!u.name.trim() && (u.mode === 'create' || u.code.length === 4) && s.connected;
    const lobbyReady = s.phase === 'room' && s.canStart && s.ownerID === s.myPlayerID && s.connected;
    const ready = !!(r.ready || homeReady || lobbyReady || s.phase === 'game_over') && !u.rosterOpen && !u.manual;
    const transmitText = s.phase === 'home' ? u.mode === 'create' ? '建立频道' : '接入频道' : s.phase === 'room' ? '开始行动' : s.phase === 'game_over' ? '返回通信局' : u.submitted ? '已发送' : '发报 · 确认';
    tr.textAlign = 'center';
    text(tr, transmitText, 300, 41, 48, ready ? '#fff0d2' : '#dcc1a2', 600);
    frame('transmitControl', 600, 260);
    target('transmitControl', 'transmit', transmitText, 0, 0, 600, 260, { disabled: !ready });
    const dl = frame('disklabel', 300, 100);
    text(dl, '密 钥 / 01', 16, 51, 37, INK, 600);
    text(dl, 'DECRYPTO', 17, 85, 19, '#817c70');
    const po = frame('power', 100, 130);
    text(po, 'I', 37, 46, 41, CREAM);
    text(po, 'O', 32, 98, 30, CREAM);
    const ft = frame('footer', 1100, 65);
    text(ft, s.connected ? '链路已接通' : '正在连接…', 350, 32, 37, s.connected ? '#355b45' : '#865135');
    text(ft, '电源', 7, 32, 36, INK);
    text(ft, '非官方线上演绎', 770, 32, 23, '#817c70');
    frame('batteryControl', 100, 100);
    target('batteryControl', 'battery-toggle', u.batteryOpen ? '合上电池仓盖' : '掀开电池仓盖，查看四节电池', 0, 0, 100, 100);
    frame('soundControl', 100, 100);
    target('soundControl', 'sound-toggle', u.soundOn ? '关闭机械音效' : '开启机械音效并试听喇叭', 0, 0, 100, 100);
    frame('testControl', 100, 100);
    target('testControl', 'lamp-test', '本机灯光自检，不改变对局连接', 0, 0, 100, 100);
    const rearControls = new Set(['battery-toggle', 'sound-toggle', 'lamp-test']);
    for (let i = 0; i < 4; i++) {
        const name = `batteryCell${i}Control`, id = `battery-cell-${i}`;
        frame(name, 100, 300);
        if (u.batteryOpen) target(name, id, `${u.removedBatteries & (1 << i) ? '装回' : '取出'}第 ${i + 1} 节电池`, 0, 0, 100, 300);
        rearControls.add(id);
    }
    ['RJ45', 'Serial', 'DC'].forEach((name, i) => {
        const surface = `${name}PlugControl`, id = `cable-plug-${i}`;
        frame(surface, 180, 100);
        target(surface, id, `${u.unpluggedCables & (1 << i) ? '插回' : '拔出'}${['网线', '串口线', '电源线'][i]}`, 0, 0, 180, 100);
        rearControls.add(id);
    });
    for (const [name, id, label, value] of [
        ['MeterAmplitude', 'meter-amplitude', '调整 VU 表摆动幅度', u.meterAmplitude],
        ['MeterRate', 'meter-rate', '调整 VU 表摆动频率', u.meterRate],
    ] as const) {
        frame(name + 'Control', 100, 100);
        target(name + 'Control', id, `${label}，当前第 ${value + 1} 档`, 0, 0, 100, 100);
    }
    const seats: Record<string, boolean> = {};
    teams.forEach(team => team.seats.forEach((seat, i) => { seats[team.team + i] = !!seat.player; }));
    return { frames, targets: targets.filter(t => rearControls.has(t.id) === u.backView),
        status: status || `${s.phase} · ${s.connected ? '已连接' : '连接中'}`, tint, waiting, ready, lamps, seats, activity };
}
