import { localizeError } from './i18n';
import { originalGameLinks, gameIntroduction, guideSteps } from './guide';
import { word, keyDiskMessage, teamPalette, themeColors, beats, isBeat, briefingKey, transmission, deadlineWarning, timeoutNotice, resultView, resultSummary, handoverLine, gameOverView } from './model';
import type { Beat, StationState } from './model';
import { CREAM, DARK, DIM, FONT, MUTED, RULE, fitLabel, readableText, textLines, line, round, text, wrap, type Painter } from './paintKit';
import { guideNav, paintGuide } from './paintGuide';

const guidePages = guideSteps.length;

/**
 * The main CRT: one page for what this seat does now. `overlay` is painted last,
 * over whatever page is up: the offline notice and the battery gauge.
 */
export function paintScreen(p: Painter, guideArt?: HTMLImageElement) {
    const { s, u, h, r, t, colors, tint, frames, targets, blink, cast, guidePage, hasGame, diskReadable, frame, target, button } = p;
    const c = frame('screen', 1400, 830, DARK);
    // Draw in 1000 logical units; this keeps Chinese crisp without tiny GPU text.
    c.scale(1.4, 1.4);
    frames.screen.width = 1000;
    frames.screen.height = 830 / 1.4;
    const w = 1000;
    const right = w - 55;
    // Most urgent first: an error, this seat's running-out time, how a timeout was settled, AI trouble.
    const warning = deadlineWarning(s, u, u.seconds), settled = s.phase === 'game_over' ? null : timeoutNotice(s);
    const status = (s.error ? localizeError(u.locale, s.error) : warning ? t(...warning) : settled ? t(...settled) : s.aiNotice ? t(s.aiNotice) : '') || (u.note ? t(u.note) : '') || (u.submitted ? t("密报已发送，等待服务器确认。") : '');
    const helpPage = u.manual || u.about;
    const briefing = !helpPage && !!u.brief && u.brief === briefingKey(s) && s.phase === 'encrypting' ? s.phase : null;
    const sent = u.submitted || s.submitted;
    const observing = isBeat(s.phase) && !briefing && !sent && !r.encrypt && !r.guess;
    const revealed = ['round_result', 'game_over'].includes(s.phase) ? [...s.history].reverse().find(row => row.round === s.round && row.secret?.length === 3) : undefined;
    const shownClues = revealed?.clues ?? (s.phase === 'encrypting' && sent && r.encrypt ? u.clues : s.clues);
    const expanded = u.readingClue ?? -1;
    const expandedClue = expanded >= 0 ? shownClues[expanded] : '';
    const handover = handoverLine(s);
    const me = [...s.teamA, ...s.teamB].find(p => p.id === s.myPlayerID);
    // Players read their own seat as "you", whichever name the roster carries.
    const called = (name: string) => name && (name === me?.nickname || s.myRole === 'encryptor' && name === s.encryptor) ? t('你') : name;
    // AI call signs carry a middle dot of their own, so lists use the language's enumeration comma.
    const listed = (people: StationState['teamA']) => people.map(p => p.id === s.myPlayerID ? t('你') : p.nickname).join(u.locale === 'zh' ? '、' : ', ');
    const navX = right - (h.batteryPercent === null ? 112 : 265);
    // The header keeps the round's context on every page: which round, and who acts in it.
    const context = u.manual ? [t('玩法 · {0} / {1}', [guidePage + 1, guidePages])] : u.about ? [t('原版桌游')] : !hasGame ? ['ENCRYPTO'] : [
        briefing ? t('第 {0} / 16 回合', [s.round]) : t('第 {0} 回合', [String(s.round).padStart(2, '0')]),
        ...!isBeat(s.phase) ? [] : briefing ? [t('简报')] :
            s.phase === 'encrypting' ? [cast.sending && t('{0} 队发报', [cast.sending]), s.encryptor && t('加密者 {0}', [called(s.encryptor)])] :
            s.phase === 'intercept' ? [cast.receiving && t('{0} 队拦截', [cast.receiving])] : [cast.sending && t('{0} 队解码', [cast.sending])],
        ...isBeat(s.phase) && !['encryptor', 'teammate', 'opponent'].includes(s.myRole) ? [t('旁观')] : [],
    ].filter(Boolean);
    const headerRoom = navX - 79;
    c.font = `500 19px ${FONT}`;
    const leadWidth = Math.min(headerRoom, c.measureText(context[0]).width);
    fitLabel(c, context[0], 55, 49, 19, tint, 500, headerRoom);
    if (context.length > 1 && headerRoom - leadWidth > 40)
        fitLabel(c, ' · ' + context.slice(1).join(' · '), 55 + leadWidth, 49, 19, MUTED, 400, headerRoom - leadWidth);
    button(c, helpPage ? 'screen-close' : 'manual', helpPage ? t('返回') : t('玩法'), navX, 27, 112, 44);
    let foot = '', live = false;
    const heading = (title: string, sub = '') => {
        if (expandedClue && !helpPage && !briefing && s.phase !== 'game_over') {
            text(c, t('线索 {0}', [expanded + 1]), 55, 105, 28, CREAM, 600);
            readableText(c, expandedClue, 55, 169, 890, 24, CREAM, 400, 22, 3);
            return;
        }
        fitLabel(c, title, 55, 127, 43, CREAM, 600, 890);
        if (sub) readableText(c, sub, 55, 180, 890, 22, MUTED, 400, 22);
    };
    const outcomeColor = (tone: 'good' | 'bad' | 'neutral') => tone === 'good' ? '#8bc995' : tone === 'bad' ? '#ed9781' : CREAM;
    const verdicts = (middle: number, compact = false) => {
        resultSummary(s).forEach((item, i) => {
            const x = 55 + i * 466;
            readableText(c, t(...item.label), x, middle, 424, compact ? 21 : 24, outcomeColor(item.tone), item.scoring ? 600 : 400, compact ? 20 : 22);
        });
    };
    // Only overflowing rows need a reading control; the numeric slot stays exposed.
    const clue = (value: string, index: number, x: number, middle: number, width: number, size = 32, color = CREAM) => {
        const overflowing = textLines(c, value, width, size, 22, 2, 500).truncated;
        const reading = expanded === index;
        readableText(c, value, x, middle, overflowing || reading ? width - 68 : width, size, color, 500, 22);
        if (overflowing || reading) {
            text(c, t(reading ? '收起' : '展开'), x + width - 55, middle, 17, tint, 500);
            target('screen', `read-clue-${index}`, t(reading ? '收起第 {0} 条线索' : '展开第 {0} 条线索', [index + 1]), x, middle - 35, width, 70);
        }
    };
    const underline = (y: number, active = false) => line(c, 55, y, 890, active ? tint : RULE);
    const measure = (value: string, size: number, weight = 400) => {
        c.font = `${weight} ${size}px ${FONT}`;
        return c.measureText(value).width;
    };
    // A block cursor where someone is working; the tube blinks it, the canvas never repaints for it.
    const cursor = (x: number, middle: number, color: string) => { c.fillStyle = color; c.fillRect(x, middle - 16, 12, 32); };
    if (u.manual) {
        paintGuide(c, u, guidePage, guideArt);
        guideNav(p, c, guidePage);
    } else if (u.about) {
        heading(t('每条线索，都是一次试探。'), t('玩法取材于原版桌游 · 可从链接了解原作'));
        wrap(c, t(gameIntroduction), 55, 253, 865, 29, CREAM, 3);
        originalGameLinks.forEach((link, i) => {
            const x = 55 + i * 303;
            button(c, 'about-' + link.id, t(link.label) + ' ↗', x, 393, 284, 62);
            targets[targets.length - 1].href = link.href;
        });
        button(c, 'manual', t('一图读懂玩法') + ' →', 55, 478, 270, 46);
        foot = t('非官方玩家作品 · 与原作方无关联 · 请支持原版桌游。');
    } else if (s.phase === 'home') {
        heading(t('接通你的秘密频道。'));
        ['create', 'join'].forEach((mode, i) => {
            const x = 55 + i * 222, active = u.mode === mode;
            text(c, t(mode === 'create' ? '建立频道' : '加入频道'), x, 213, 25, active ? tint : MUTED, 500);
            if (active) line(c, x, 243, 182, tint);
            target('screen', 'mode-' + mode, t(mode === 'create' ? '建立频道' : '加入频道'), x, 190, 192, 56);
        });
        field('name', u.name, t('输入你的代号'), 55, 283, 890, 74, 20);
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
                line(c, left, 343, 82, p ? color : RULE);
                text(c, p ? p.is_ai ? 'AI' : p.id === s.myPlayerID ? t('你') : t('真人') : '—', left + 10, 314, 23, p ? CREAM : MUTED);
                if (owner && p?.is_ai) {
                    text(c, '×', left + 60, 308, 20, MUTED);
                    target('screen', `remove-${team}-${i}`, t('移除 {0}', [p.nickname]), left, 286, 84, 62);
                }
            }
            button(c, `team-${team}`, t(joined ? '离开此队' : '加入此队'), x, 395, 249, 56, !s.connected || (!joined && people.length >= 4), joined);
            if (owner) button(c, `ai-${team}`, '+ AI', x + 268, 395, 152, 56, people.length >= 4 || !s.connected);
        });
        // Anyone in the room without a team would only watch the game.
        const seated = new Set([...s.teamA, ...s.teamB].map(p => p.id));
        const unseated = s.players.filter(p => !p.is_ai && !seated.has(p.id));
        if (unseated.length) fitLabel(c, t('未入队：{0} · 开局后只能旁观', [unseated.map(p => p.id === s.myPlayerID ? t('你') : p.nickname).join(u.locale === 'zh' ? '、' : ', ')]), 55, 487, 20, colors.warning.light, 400, 890);
        foot = owner ? s.canStart ? t('双方就绪，按 ACTION 开始。') : t('等待人员就绪…') : t('等待房主开始行动。');
    } else if (s.phase === 'game_over') {
        // Why it ended, both teams' scores, and the keywords nobody saw until now.
        const over = gameOverView(s);
        heading(t(...over.title), [over.mine && t(over.mine), t(...over.reason)].filter(Boolean).join(' · '));
        verdicts(231, true);
        (['A', 'B'] as const).forEach((team, j) => {
            const y = 305 + j * 101, score = team === 'A' ? s.scoreA : s.scoreB;
            const words = (team === 'A' ? s.gameOver?.wordsA : s.gameOver?.wordsB) ?? (team === s.myTeam ? s.myWords : []);
            fitLabel(c, t('{0} 队', [team]) + (team === s.myTeam ? t(' · 我方') : ''), 55, y, 25, teamPalette(team, s.myTeam, u.theme).light, 600, 200);
            fitLabel(c, t('截获 {0} · 失误 {1}', [score.interceptions, score.decrypt_failures]), 55, y + 36, 17, MUTED, 400, 200);
            words.forEach((value, i) => {
                const x = 280 + i * 168;
                text(c, String(i + 1), x, y + 2, 18, MUTED, 600);
                readableText(c, word(value, u.locale), x + 24, y + 14, 136, 25, CREAM, 500, 20, 3);
            });
            line(c, 55, y + 64, 890, RULE);
        });
        button(c, 'leave-room', t('离开频道'), 55, 478, 200, 40);
        foot = t('按 ACTION 回到房间，原班人马再来一局。');
    } else if (s.phase === 'round_result') {
        const view = resultView(s);
        heading(t(...view.title));
        if (!expandedClue) verdicts(180);
        if (revealed) {
            text(c, t('截获'), 635, 220, 18, MUTED);
            text(c, t('解码'), 750, 220, 18, MUTED);
            text(c, t('密码'), 875, 220, 18, MUTED);
        }
        [0, 1, 2].forEach(i => {
            const y = 239 + i * 92, middle = y + 27;
            underline(y + 67);
            text(c, `0${i + 1}`, 55, middle, 22, MUTED);
            clue(shownClues[i] || t('等待公开线索。'), i, 126, middle, revealed ? 466 : 750);
            if (!revealed) return;
            [revealed.intercept, revealed.decrypt].forEach((guess, j) => {
                const digit = guess?.[i], match = digit === revealed.secret![i];
                text(c, digit ? `${digit} ${match ? '✓' : '✗'}` : '—', 635 + j * 115, middle, 27, digit ? match ? CREAM : '#ed9781' : DIM, 500);
            });
            text(c, String(revealed.secret![i]), 875, middle, 42, tint, 500);
        });
        foot = revealed ? t('结果已记入纸带 · 等待下一步通信。') : view.sub ? t(...view.sub) : t('本轮结束后揭晓密码。');
    } else if (briefing) {
        paintBriefing(briefing);
    } else if (sent) {
        const confirmed = s.submitted;
        heading(t(confirmed ? '已提交' : '正在发送…'), t(confirmed ? '已提交，等待结算。' : '等待服务器确认。'));
        [0, 1, 2].forEach(i => {
            const y = 239 + i * 92;
            underline(y + 67);
            text(c, `0${i + 1}`, 55, y + 27, 22, MUTED);
            clue((r.encrypt ? u.clues[i] : s.clues[i]) || '—', i, 126, y + 27, 674);
            if (r.guess && u.guess[i]) text(c, String(u.guess[i]), 875, y + 27, 42, tint, 500);
        });
    } else if (observing) {
        paintWatch();
    } else {
        heading(t(r.encrypt ? '写下三条线索。' : s.phase === 'intercept' ? '截获对手的密码。' : '译出队友的密码。'), handover ? t(...handover) : t(r.encrypt ? diskReadable ? '按私密密码顺序，分别提示对应密词。' : keyDiskMessage(u.keyDisk) : '点击一行，再用下方数字键选择编号。'));
        [0, 1, 2].forEach(i => {
            const y = 239 + i * 92;
            const active = u.focus === `clue-${i}` || r.guess && u.slot === i;
            underline(y + 67, active);
            if (r.encrypt) {
                text(c, diskReadable ? String(s.secretDigits[i] ?? '—') : '—', 55, y + 27, 40, tint, 500);
                fitLabel(c, diskReadable ? word(s.myWords[(s.secretDigits[i] ?? 1) - 1] || s.secretWords[i], u.locale) : t('已隐藏'), 119, y + 27, 25, tint, 500, 152);
                const editable = r.active && s.connected;
                if (u.focus !== `clue-${i}` || !editable)
                    readableText(c, u.clues[i] || t('写下关联线索…'), 310, y + 27, 624, 28, u.clues[i] ? CREAM : '#89958f', 400, 22);
                target('screen', `clue-${i}`, t('第 {0} 条线索', [i + 1]), 299, y - 9, 646, 72, {
                    kind: 'input', value: u.clues[i], maxLength: 80, disabled: !editable,
                    input: { fontSize: 28, padding: 11, placeholder: t('写下关联线索…') },
                });
            } else {
                text(c, `0${i + 1}`, 55, y + 27, 22, MUTED);
                text(c, String(u.guess[i] || '—'), 875, y + 27, 42, active ? tint : MUTED, 500);
                // The empty slot the next key will fill blinks like a terminal cursor.
                if (active && !u.guess[i] && r.active) blink.push({ x: 866, y: y + 3, w: 52, h: 48, kind: 'cursor' });
                target('screen', `slot-${i}`, t('选择第 {0} 位密码', [i + 1]), 55, y - 9, 890, 78, { disabled: !r.active });
                clue(s.clues[i] || t('等待线索…'), i, 126, y + 27, 674);
            }
        });
        // With more than one of us on the keypad, a teammate's picks arrive as they make them.
        const peer = r.guess && s.playerProgress?.action === r.action && s.playerProgress.state === 'editing' &&
            s.playerProgress.player !== 'AI Agent' && s.playerProgress.player !== me?.nickname ? s.playerProgress : null;
        foot = r.encrypt ? t('已填写 {0} / 3 · 按 ACTION 发报', [u.clues.filter(v => v.trim()).length]) :
            peer ? t('{0} 选了 {1} · 按 ACTION 确认', [peer.player, [0, 1, 2].map(i => peer.guesses?.[i] || '—').join(' · ')]) : t('三个不同编号 · 按 ACTION 确认');
    }
    if (!u.manual) {
        line(c, 55, 527, 890, RULE);
        if (live && !status) {
            // The link lamp of the terminal: a slow pulse while the other seat is quiet.
            text(c, '●', 55, 555, 15, tint);
            blink.push({ x: 50, y: 543, w: 22, h: 24, kind: 'live' });
            fitLabel(c, foot, 80, 555, 21, MUTED, 400, 865);
        } else fitLabel(c, status || foot, 55, 555, warning ? 23 : 21, status ? colors.warning.light : MUTED, warning ? 600 : 400, 890);
    } else if (status && s.error) {
        c.fillStyle = DARK; c.fillRect(50, 539, 900, 42);
        fitLabel(c, status, 55, 559, 19, colors.warning.light, 400, 890);
    }
    /** Round start and every handover: who acts in this beat, and what this seat does now. */
    function paintBriefing(beat: Beat) {
        const step = beats.indexOf(beat);
        const teamOf = (i: number) => i === 1 ? cast.receiving : cast.sending;
        const color = (i: number) => teamPalette(teamOf(i), s.myTeam, u.theme).light;
        const encryptor = called(s.encryptor) || t('加密者');
        const headline = beat === 'encrypting' ? cast.sending ? t('{0} 队发报', [cast.sending]) : t('新的回合开始') :
            beat === 'intercept' ? t('{0} 队拦截', [cast.receiving || '—']) : t('{0} 队解码', [cast.sending || '—']);
        fitLabel(c, headline, 55, 127, 43, color(step), 600, 890);
        // Teams by letter, never "rivals": the same page reaches both sides of the table.
        fitLabel(c, beat === 'encrypting' ? t('加密者读取密码，为三个编号各写一条线索。') :
            beat === 'intercept' ? t('{0} 队的三条线索已公开，{1} 队先猜。', [cast.sending || '—', cast.receiving || '—']) :
            !cast.intercepted ? t('前两次发报不拦截，线索直达 {0} 队。', [cast.sending || '—']) :
            t('{0} 队没能截获，轮到 {1} 队解码。', [cast.receiving || '—', cast.sending || '—']),
            55, 180, 22, MUTED, 400, 890);
        // The round as the phase panel shows it: three stations, the current one lit.
        const stations = [
            { name: encryptor, who: cast.sending ? t('{0} 队 · 写三条线索', [cast.sending]) : t('写三条线索') },
            cast.intercepted ? { name: cast.receiving ? t('{0} 队', [cast.receiving]) : '—', who: listed(cast.interceptors) || t('看公开线索与旧记录') }
                : { name: '—', who: t('前两次发报不拦截') },
            { name: listed(cast.decoders) || '—', who: cast.sending ? t('{0} 队 · 对照密词解码', [cast.sending]) : t('对照我方密词解码') },
        ];
        stations.forEach((station, i) => {
            const x = 55 + i * 312, skipped = i === 1 && !cast.intercepted;
            const state = skipped ? 'skip' : i < step ? 'done' : i === step ? 'now' : 'next';
            const ink = state === 'now' ? color(i) : state === 'done' ? CREAM : DIM;
            text(c, `0${i + 1}`, x, 242, 18, ink, 600);
            fitLabel(c, t(['加密', '拦截', '解码'][i]), x + 34, 242, 20, ink, 600, 200);
            if (i < 2) text(c, '›', x + 282, 242, 26, DIM);
            c.fillStyle = state === 'now' ? color(i) : state === 'done' ? '#6f7c78' : '#2b3a3c';
            c.fillRect(x, state === 'now' ? 259 : 260, 266, state === 'now' ? 4 : 2);
            fitLabel(c, station.name, x, 304, 28, state === 'now' || state === 'done' ? CREAM : MUTED, 600, 266);
            text(c, station.who, x, 342, 17, MUTED, 400, 266);
            const mark = t(state === 'now' ? '进行中' : state === 'done' ? i === 1 ? s.roundResult?.intercept_success ? '已截获' : '未截获' : '已完成' : state === 'skip' ? '本轮跳过' : '稍后');
            if (state === 'now') {
                cursor(x, 382, color(i));
                text(c, mark, x + 22, 382, 19, color(i), 600);
                blink.push({ x: x - 4, y: 362, w: 34 + measure(mark, 19, 600), h: 40, kind: 'cursor' });
            } else text(c, state === 'done' && i !== 1 ? `✓ ${mark}` : mark, x, 382, 19, state === 'done' ? CREAM : DIM, 500);
        });
        const role = s.myRole;
        const you = beat === 'encrypting'
            ? role === 'encryptor' ? t('你来加密：等软盘读出密码，再写三条线索。')
            : role === 'teammate' ? t('你负责解码：先等 {0} 写好线索。', [encryptor])
            : role === 'opponent' ? t(cast.intercepted ? '你方稍后拦截：留意他们的线索。' : '本轮你方旁听：前两次发报不拦截。')
            : t('你正在旁听这一轮。')
            : beat === 'intercept'
            ? role === 'opponent' ? t('轮到你拦截：三个编号全对才算截获。')
            : role === 'encryptor' || role === 'teammate' ? t('对手正在猜你们的密码。') : t('你正在旁听这一轮。')
            : role === 'teammate' ? t('轮到你解码：对照我方密词，按顺序选编号。')
            : role === 'encryptor' ? t('队友正在解码，你只能等待。')
            : role === 'opponent' ? t('{0} 队正在解码。', [cast.sending || '—']) : t('你正在旁听这一轮。');
        line(c, 55, 424, 890, RULE);
        text(c, '▶', 55, 464, 20, tint);
        fitLabel(c, you, 86, 464, 26, CREAM, 500, 859);
        foot = t('稍后进入 · 按任意键跳过');
        // The whole glass skips ahead; the header's guide key stays above it.
        targets.unshift({ surface: 'screen', id: 'brief-skip', label: t('跳过简报'), x: 0, y: 0, w: w, h: frames.screen.height });
    }
    /** Another seat is acting: its three slots, the one being worked on blinking. */
    function paintWatch() {
        const tx = transmission(s, diskReadable && s.myRole === 'encryptor')!;
        const team = s.phase === 'intercept' ? cast.receiving : cast.sending;
        const crew = team ? t('{0} 队', [team]) : t('对手');
        heading(s.phase === 'encrypting' ? t('{0} 正在加密。', [called(s.encryptor) || t('加密者')]) :
            s.phase === 'intercept' ? team ? t('{0} 队正在拦截。', [team]) : t('对手正在拦截。') :
            s.myRole === 'encryptor' || !team ? t('队友正在解码。') : t('{0} 队正在解码。', [team]),
            handover ? t(...handover) : s.phase === 'encrypting'
                ? t(s.myRole === 'teammate' ? cast.intercepted ? '线索写好后，对手先拦截，再轮到你解码。' : '线索写好后，就轮到你解码。'
                    : s.myRole === 'opponent' ? cast.intercepted ? '线索写好后，轮到你方拦截。' : '前两次发报不拦截，这一轮你方旁听。' : '线索发出后，这里会公开显示。')
                : s.myRole === 'encryptor' && diskReadable ? t('本轮密码 {0} · 对照看他们猜得对不对。', [s.secretDigits.join('·')])
                : t(s.phase === 'intercept' ? '他们只看得到公开线索和旧记录。' : s.myRole === 'encryptor' ? '你只能看着，不能提示。' : '看看他们能不能译对。'));
        tx.slots.forEach((slot, i) => {
            const y = 239 + i * 92, middle = y + 27;
            underline(y + 67, slot.active);
            text(c, `0${i + 1}`, 55, middle, 22, slot.active ? tint : MUTED);
            if (s.phase === 'encrypting') {
                if (slot.active) {
                    const label = t(slot.done ? '正在修改这一条…' : '正在写这一条…');
                    cursor(126, middle, tint);
                    fitLabel(c, label, 152, middle, 28, tint, 500, 560);
                    blink.push({ x: 120, y: middle - 24, w: 42 + Math.min(560, measure(label, 28, 500)), h: 48, kind: 'cursor' });
                } else if (slot.done) {
                    text(c, t('已写好'), 126, middle, 28, CREAM, 500);
                    text(c, '✓', 875, middle, 32, tint, 600);
                } else text(c, t('等待'), 126, middle, 28, DIM);
                return;
            }
            clue(s.clues[i] || t('等待线索…'), i, 126, middle, 560);
            c.save();
            c.textAlign = 'right';
            if (slot.active) {
                text(c, t('推敲中'), 856, middle, 21, tint, 500);
                cursor(876, middle, tint);
                blink.push({ x: 846 - measure(t('推敲中'), 21, 500), y: middle - 24, w: 60 + measure(t('推敲中'), 21, 500), h: 48, kind: 'cursor' });
            } else if (slot.done && slot.digit) {
                // Only the encryptor can grade a pick; a rival's hit is bad news, a teammate's is good.
                if (slot.match !== undefined) {
                    const rivals = s.phase === 'intercept';
                    text(c, t(rivals ? slot.match ? '猜中' : '未中' : slot.match ? '译对' : '译错'), 856, middle, 21,
                        rivals === slot.match ? colors.warning.light : slot.match ? tint : MUTED, 600);
                }
            } else if (slot.done) text(c, t('已选定'), 856, middle, 21, CREAM, 500);
            c.restore();
            if (slot.done && slot.digit) text(c, String(slot.digit), 875, middle, 42, tint, 500);
            else if (!slot.active) text(c, slot.done ? '●' : '—', 875, middle, slot.done ? 24 : 42, slot.done ? CREAM : MUTED, 500);
        });
        live = true;
        const who = tx.player ? called(tx.player) : crew;
        const working = tx.slots.findIndex(slot => slot.active);
        foot = !tx.started ? t('链路已接通 · 等待 {0} 开始', [s.phase === 'encrypting' ? called(s.encryptor) || t('加密者') : crew]) :
            tx.ai && working >= 0 ? t(tx.retrying ? '{0} 正在重试第 {1} 条' : '{0} 正在推理第 {1} 条', [who, working + 1]) :
            t(s.phase === 'encrypting' ? '{0} · 已写好 {1} / 3' : '{0} · 已选 {1} / 3', [who, tx.count]);
    }
    function field(id: string, value: string, placeholder: string, x: number, y: number, width: number, height: number, maxLength: number) {
        if (!s.connected) placeholder = t('连接中') + '…';
        line(c, x, y + height, width, u.focus === id ? tint : '#526361');
        if (u.focus !== id || !s.connected) fitLabel(c, value || placeholder, x + 4, y + height / 2, 32, value ? CREAM : '#89958f', 400, width - 20);
        target('screen', id, id === 'name' ? t('特工代号') : t('四位频道编号'), x, y, width, height, { kind: 'input', value, maxLength, disabled: !s.connected,
            input: { fontSize: 32, padding: 4, placeholder } });
    }
    function overlay() {
        if (!h.online && h.powered) {
            blink.length = 0;
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
    }
    return { status, briefing, sent, observing, overlay };
}
